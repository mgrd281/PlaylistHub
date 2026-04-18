import { type NextRequest, NextResponse } from 'next/server';

/**
 * Stream proxy — routes IPTV content through Scanner Service.
 *
 * Strategy: Scanner Service (on non-blocked IP) → CF Worker fallback → direct
 * Scanner handles VLC UA + redirect following + Range headers.
 */
export const runtime = 'edge';

/* ── helpers ── */

function normalizeUrl(value: string): string {
  return value.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

const VLC_HEADERS: Record<string, string> = {
  'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
  Accept: '*/*',
};

/** Try fetching through the Scanner Service (primary — runs on non-blocked IP) */
async function fetchViaScanner(
  targetUrl: string,
  rangeHeader?: string | null,
): Promise<Response | null> {
  // Try SCANNER_API_URL first (dedicated scanner), then SCANNER_STREAM_URL (tunnel)
  const urls = [
    process.env.SCANNER_API_URL?.trim().replace(/\/$/, ''),
    process.env.SCANNER_STREAM_URL?.trim().replace(/\/$/, ''),
  ].filter(Boolean) as string[];

  const token = process.env.SCANNER_API_TOKEN ?? '';

  for (const base of urls) {
    try {
      const url = `${base}/stream?url=${encodeURIComponent(targetUrl)}`;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (rangeHeader) headers['Range'] = rangeHeader;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers,
      });
      if (res.ok || res.status === 206) return res;
    } catch { /* unreachable */ }
  }
  return null;
}

/** Try fetching through CF Worker (fallback) */
async function fetchViaCfWorker(targetUrl: string): Promise<Response | null> {
  const proxyUrl = process.env.STREAM_PROXY_URL?.trim().replace(/\/$/, '');
  if (!proxyUrl) return null;

  try {
    const separator = proxyUrl.includes('?') ? '&' : '?';
    const url = `${proxyUrl}${separator}url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok || res.status === 206) return res;
  } catch { /* unreachable */ }
  return null;
}

/** Direct fetch with VLC UA (works only if Vercel IP isn't blocked) */
async function directFetch(
  url: string,
  timeoutMs = 6000,
): Promise<Response | null> {
  try {
    const res = await fetch(normalizeUrl(url), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: VLC_HEADERS,
    });
    if (res.ok || res.status === 206) return res;
  } catch { /* failed */ }
  return null;
}

async function streamResponse(upstream: Response, targetUrl: string): Promise<NextResponse> {
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const isManifest =
    contentType.includes('mpegurl') || /\.m3u8?(?:[?#]|$)/i.test(targetUrl);

  const baseHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cache-Control': 'no-store',
  };

  if (isManifest) {
    // Rewrite HLS manifest: scanner returns /stream?url=... paths,
    // but on Vercel the endpoint is /api/stream. Also rewrite any
    // bare http:// URLs to go through our proxy.
    const text = await upstream.text();
    const rewritten = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          // Rewrite URIs inside #EXT-X-MAP or similar tags
          return line.replace(/URI="([^"]+)"/, (_m, uri: string) => {
            const abs = uri.startsWith('http') ? uri : uri;
            return `URI="/api/stream?url=${encodeURIComponent(abs)}"`;
          });
        }
        // Scanner already rewrote to /stream?url=<encoded>
        if (trimmed.startsWith('/stream?url=')) {
          return '/api' + trimmed;
        }
        // Absolute http URL — proxy it
        if (trimmed.startsWith('http')) {
          return `/api/stream?url=${encodeURIComponent(trimmed)}`;
        }
        // Relative path — resolve against original target URL base
        try {
          const base = new URL(targetUrl);
          const abs = new URL(trimmed, base).href;
          return `/api/stream?url=${encodeURIComponent(abs)}`;
        } catch {
          return line;
        }
      })
      .join('\n');

    return new NextResponse(rewritten, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  }

  const headers: Record<string, string> = {
    ...baseHeaders,
    'Content-Type': contentType,
  };

  // Forward range-related headers
  const cl = upstream.headers.get('content-length');
  const cr = upstream.headers.get('content-range');
  if (cl) headers['Content-Length'] = cl;
  if (cr) headers['Content-Range'] = cr;
  headers['Accept-Ranges'] = upstream.headers.get('accept-ranges') || 'bytes';

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

/* ── route handler ── */

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad');
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const rangeHeader = req.headers.get('range');
  const errors: string[] = [];

  // 1. Scanner Service (primary — non-blocked IP with VLC UA)
  const scanner = await fetchViaScanner(targetUrl, rangeHeader);
  if (scanner) return await streamResponse(scanner, targetUrl);
  errors.push('scanner: unavailable');

  // 2. CF Worker (fallback)
  const cf = await fetchViaCfWorker(targetUrl);
  if (cf) return await streamResponse(cf, targetUrl);
  errors.push('cf-worker: unavailable');

  // 3. Direct fetch (last resort — usually blocked)
  const direct = await directFetch(targetUrl);
  if (direct) return await streamResponse(direct, targetUrl);
  errors.push('direct: blocked');

  // 4. HTTPS upgrade + direct
  if (targetUrl.startsWith('http://')) {
    const https = await directFetch(targetUrl.replace('http://', 'https://'), 10000);
    if (https) return await streamResponse(https, targetUrl);
    errors.push('https: blocked');
  }

  return NextResponse.json(
    { error: 'Stream unavailable', details: errors },
    { status: 502 },
  );
}

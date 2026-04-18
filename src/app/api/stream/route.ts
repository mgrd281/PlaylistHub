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
        signal: AbortSignal.timeout(30000),
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
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (res.ok || res.status === 206) return res;
  } catch { /* unreachable */ }
  return null;
}

/** Direct fetch with VLC UA (works only if Vercel IP isn't blocked) */
async function directFetch(
  url: string,
  timeoutMs = 15000,
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

function streamResponse(upstream: Response, targetUrl: string): NextResponse {
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const isManifest =
    contentType.includes('mpegurl') || /\.m3u8?(?:[?#]|$)/i.test(targetUrl);

  if (isManifest) {
    // We need to rewrite URLs in HLS manifests — but can't do async in map.
    // Return as-is since scanner already rewrites relative URLs to absolute.
    // For proxy mode, we'll rewrite in the text handler below.
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cache-Control': 'no-store',
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
  if (scanner) return streamResponse(scanner, targetUrl);
  errors.push('scanner: unavailable');

  // 2. CF Worker (fallback)
  const cf = await fetchViaCfWorker(targetUrl);
  if (cf) return streamResponse(cf, targetUrl);
  errors.push('cf-worker: unavailable');

  // 3. Direct fetch (last resort — usually blocked)
  const direct = await directFetch(targetUrl);
  if (direct) return streamResponse(direct, targetUrl);
  errors.push('direct: blocked');

  // 4. HTTPS upgrade + direct
  if (targetUrl.startsWith('http://')) {
    const https = await directFetch(targetUrl.replace('http://', 'https://'), 10000);
    if (https) return streamResponse(https, targetUrl);
    errors.push('https: blocked');
  }

  return NextResponse.json(
    { error: 'Stream unavailable', details: errors },
    { status: 502 },
  );
}

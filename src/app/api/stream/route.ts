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

function isManifestRequest(url: string): boolean {
  return /\.m3u8?(?:[?#]|$)/i.test(url);
}

function hasClearlyNonMediaType(contentType: string): boolean {
  return (
    contentType.includes('text/html') ||
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml')
  );
}

async function isUsableStreamPayload(res: Response, targetUrl: string): Promise<boolean> {
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (hasClearlyNonMediaType(contentType)) return false;

  const manifestExpected = isManifestRequest(targetUrl) || contentType.includes('mpegurl');
  if (manifestExpected) {
    try {
      const preview = (await res.clone().text()).slice(0, 8192).trimStart();
      if (!preview) return false;
      const lower = preview.toLowerCase();
      if (
        lower.startsWith('<!doctype html') ||
        lower.startsWith('<html') ||
        lower.startsWith('{') ||
        lower.startsWith('[')
      ) {
        return false;
      }
      return preview.includes('#EXTM3U') || /#EXT-X-|#EXTINF/.test(preview);
    } catch {
      return false;
    }
  }

  // Some providers respond with text/plain error pages while still returning 200.
  if (contentType.startsWith('text/')) {
    try {
      const preview = (await res.clone().text()).slice(0, 2048).toLowerCase();
      if (
        preview.includes('<html') ||
        preview.includes('error') ||
        preview.includes('not found') ||
        preview.includes('forbidden') ||
        preview.includes('access denied')
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/** Try fetching through a Scanner Service endpoint */
async function fetchViaScannerUrl(
  base: string,
  targetUrl: string,
  rangeHeader?: string | null,
): Promise<Response | null> {
  const token = process.env.SCANNER_API_TOKEN ?? '';
  try {
    const url = `${base}/stream?url=${encodeURIComponent(targetUrl)}`;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (rangeHeader) headers['Range'] = rangeHeader;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers });
    if ((res.ok || res.status === 206) && await isUsableStreamPayload(res, targetUrl)) return res;
  } catch { /* timeout or network error */ }
  return null;
}

/** Try fetching through CF Worker */
async function fetchViaCfWorker(targetUrl: string, rangeHeader?: string | null): Promise<Response | null> {
  const proxyUrl = process.env.STREAM_PROXY_URL?.trim().replace(/\/$/, '');
  if (!proxyUrl) return null;
  try {
    const separator = proxyUrl.includes('?') ? '&' : '?';
    const url = `${proxyUrl}${separator}url=${encodeURIComponent(targetUrl)}`;
    const headers: Record<string, string> = {};
    if (rangeHeader) headers['Range'] = rangeHeader;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers });
    if ((res.ok || res.status === 206) && await isUsableStreamPayload(res, targetUrl)) return res;
  } catch { /* timeout or network error */ }
  return null;
}

/** Direct fetch with VLC UA (works only if Vercel IP isn't blocked) */
async function directFetch(
  url: string,
  timeoutMs = 8000,
  rangeHeader?: string | null,
): Promise<Response | null> {
  try {
    const headers: Record<string, string> = { ...VLC_HEADERS };
    if (rangeHeader) headers['Range'] = rangeHeader;
    const res = await fetch(normalizeUrl(url), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers,
    });
    if ((res.ok || res.status === 206) && await isUsableStreamPayload(res, url)) return res;
  } catch { /* failed */ }
  return null;
}

/**
 * Race multiple fetch strategies in parallel — first successful response wins.
 * Losers are silently discarded (edge runtime doesn't support AbortController on inflight fetches,
 * but the responses will be GC'd).
 */
async function raceStrategies(
  targetUrl: string,
  rangeHeader?: string | null,
): Promise<Response | null> {
  const strategies: Promise<Response | null>[] = [];

  // Scanner endpoints (run in parallel with each other + CF worker)
  const scannerUrls = [
    process.env.SCANNER_API_URL?.trim().replace(/\/$/, ''),
    process.env.SCANNER_STREAM_URL?.trim().replace(/\/$/, ''),
  ].filter(Boolean) as string[];
  for (const base of scannerUrls) {
    strategies.push(fetchViaScannerUrl(base, targetUrl, rangeHeader));
  }

  // CF Worker
  strategies.push(fetchViaCfWorker(targetUrl, rangeHeader));

  // Direct fetch (usually blocked but sometimes works — cheap to try in parallel)
  strategies.push(directFetch(targetUrl, 8000, rangeHeader));

  // Race: first non-null result wins
  try {
    return await Promise.any(
      strategies.map(p => p.then(r => { if (!r) throw new Error('skip'); return r; }))
    );
  } catch {
    // All strategies returned null
    return null;
  }
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
          return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
            const abs = uri.startsWith('http') ? uri : (() => {
              try { return new URL(uri, new URL(targetUrl)).href; } catch { return uri; }
            })();
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

  // Race all proxy strategies in parallel — first successful response wins
  const winner = await raceStrategies(targetUrl, rangeHeader);
  if (winner) return await streamResponse(winner, targetUrl);

  // All strategies exhausted — try HTTPS upgrade as last resort
  if (targetUrl.startsWith('http://')) {
    const https = await directFetch(targetUrl.replace('http://', 'https://'), 10000, rangeHeader);
    if (https) return await streamResponse(https, targetUrl);
  }

  return NextResponse.json(
    { error: 'Stream unavailable' },
    { status: 502 },
  );
}

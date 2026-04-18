import { type NextRequest, NextResponse } from 'next/server';

/**
 * Stream proxy — proxies IPTV content through the server.
 *
 * Strategy chain:
 * 1. External proxy (Cloudflare Worker / Scanner on residential IP)
 * 2. Direct fetch (with VLC UA)
 */
export const runtime = 'edge';

/* ── helpers ── */

function normalizeUrl(value: string): string {
  return value.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

const VLC_HEADERS: Record<string, string> = {
  'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
  Accept: '*/*',
  'Icy-MetaData': '1',
};

async function directFetch(
  url: string,
  timeoutMs = 20000,
): Promise<{ response: Response | null; error: string }> {
  const normalized = normalizeUrl(url);
  try {
    const res = await fetch(normalized, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: VLC_HEADERS,
    });
    if (res.ok || res.status === 206) return { response: res, error: '' };
    return { response: null, error: `HTTP ${res.status}` };
  } catch (err) {
    return { response: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Proxy through external service (Cloudflare Worker or Scanner VM) */
async function fetchViaExternalProxy(targetUrl: string): Promise<Response | null> {
  const proxyUrl = process.env.STREAM_PROXY_URL?.trim().replace(/\/$/, '');
  const proxyToken = process.env.STREAM_PROXY_TOKEN;
  if (!proxyUrl) return null;

  try {
    const separator = proxyUrl.includes('?') ? '&' : '?';
    const url = `${proxyUrl}${separator}url=${encodeURIComponent(targetUrl)}`;
    const headers: Record<string, string> = {};
    if (proxyToken) headers['X-Proxy-Token'] = proxyToken;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(25000),
      headers,
    });
    if (res.ok || res.status === 206) return res;
  } catch { /* proxy unreachable */ }

  // Legacy env var support (scanner service)
  const scannerUrl = process.env.SCANNER_API_URL?.trim().replace(/\/$/, '');
  if (scannerUrl && scannerUrl !== proxyUrl) {
    try {
      const res = await fetch(
        `${scannerUrl}/stream?url=${encodeURIComponent(targetUrl)}`,
        {
          signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${process.env.SCANNER_API_TOKEN ?? ''}` },
        },
      );
      if (res.ok || res.status === 206) return res;
    } catch { /* unreachable */ }
  }

  return null;
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

  const errors: string[] = [];
  let upstream: Response | null = null;

  // 1. External proxy (Cloudflare Worker / Scanner)
  upstream = await fetchViaExternalProxy(targetUrl);
  if (!upstream) errors.push('proxy: unavailable');

  // 2. Direct fetch with VLC UA
  if (!upstream) {
    const r = await directFetch(targetUrl);
    if (r.response) upstream = r.response;
    else errors.push(`direct: ${r.error}`);
  }

  // 3. HTTPS upgrade + direct
  if (!upstream && targetUrl.startsWith('http://')) {
    const r = await directFetch(targetUrl.replace('http://', 'https://'), 10000);
    if (r.response) upstream = r.response;
    else errors.push(`https: ${r.error}`);
  }

  if (!upstream) {
    return NextResponse.json(
      { error: 'Stream unavailable', details: errors },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const isManifest =
    contentType.includes('mpegurl') || /\.m3u8?(?:[?#]|$)/i.test(targetUrl);

  if (isManifest) {
    const text = await upstream.text();
    const baseUrl = upstream.url || targetUrl;

    const rewritten = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const absUrl = trimmed.startsWith('http')
          ? trimmed
          : new URL(trimmed, baseUrl).href;
        return '/api/stream?url=' + encodeURIComponent(absUrl);
      })
      .join('\n');

    return new NextResponse(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

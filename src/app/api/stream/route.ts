import { type NextRequest, NextResponse } from 'next/server';

/**
 * Stream proxy — proxies IPTV content through the server so the browser
 * can play it without CORS / mixed-content issues.
 *
 * Node.js runtime (AWS Lambda IPs) — separate pool from Edge (Cloudflare).
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

/* ── helpers ── */

function normalizeUrl(value: string): string {
  return value.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Fetch with manual redirect handling (needed for bare-% URLs in IPTV) */
async function fetchWithRedirects(
  inputUrl: string,
  timeoutMs = 25000,
  maxRedirects = 8,
): Promise<{
  response: Response | null;
  error: string | null;
  statusCode?: number;
}> {
  let currentUrl = normalizeUrl(inputUrl);
  try {
    for (let i = 0; i <= maxRedirects; i++) {
      const res = await fetch(currentUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
        headers: HEADERS,
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return { response: res, error: null };
        currentUrl = normalizeUrl(
          new URL(normalizeUrl(location), currentUrl).href,
        );
        continue;
      }
      if (!res.ok) {
        return {
          response: null,
          error: `HTTP ${res.status} ${res.statusText}`,
          statusCode: res.status,
        };
      }
      return { response: res, error: null };
    }
    return { response: null, error: 'Too many redirects' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { response: null, error: msg };
  }
}

/** Try fetching via the Oracle VM scanner proxy */
async function fetchViaScanner(
  targetUrl: string,
): Promise<Response | null> {
  const scannerUrl = process.env.SCANNER_API_URL?.trim().replace(/\/$/, '');
  const scannerToken = process.env.SCANNER_API_TOKEN;
  if (!scannerUrl) return null;
  try {
    const res = await fetch(
      `${scannerUrl}/stream?url=${encodeURIComponent(targetUrl)}`,
      {
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${scannerToken ?? ''}` },
      },
    );
    if (res.ok) return res;
  } catch {
    /* scanner unreachable */
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
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    let upstream: Response | null = null;
    const errors: string[] = [];

    // Strategy 1: Scanner service (residential IP tunnel)
    upstream = await fetchViaScanner(targetUrl);
    if (!upstream) errors.push('scanner: unavailable');

    // Strategy 2: HTTPS upgrade
    if (!upstream && targetUrl.startsWith('http://')) {
      const httpsUrl = targetUrl.replace('http://', 'https://');
      const result = await fetchWithRedirects(httpsUrl, 12000);
      if (result.response) {
        upstream = result.response;
      } else {
        errors.push('https: ' + result.error);
      }
    }

    // Strategy 3: Direct fetch with original URL
    if (!upstream) {
      const result = await fetchWithRedirects(targetUrl, 25000);
      if (result.response) {
        upstream = result.response;
      } else {
        errors.push('direct: ' + result.error);
      }
    }

    if (!upstream) {
      return NextResponse.json(
        { error: 'Stream unavailable', details: errors },
        { status: 502 },
      );
    }

    const contentType =
      upstream.headers.get('content-type') ?? 'application/octet-stream';
    const isManifest =
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegurl') ||
      /\.m3u8?(?:[?#]|$)/i.test(targetUrl);

    if (isManifest) {
      const text = await upstream.text();
      const baseUrl = upstream.url || targetUrl;

      const rewritten = text
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;

          let originalUrl: string;
          const scannerMatch = trimmed.match(/^\/stream\?url=(.+)$/);
          if (scannerMatch) {
            originalUrl = decodeURIComponent(scannerMatch[1]);
          } else {
            originalUrl = trimmed.startsWith('http')
              ? trimmed
              : new URL(trimmed, baseUrl).href;
          }

          return '/api/stream?url=' + encodeURIComponent(originalUrl);
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

    // Binary (segments / VOD) — stream through
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

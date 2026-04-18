import { type NextRequest, NextResponse } from 'next/server';

/**
 * Stream proxy — proxies IPTV content through the server so the browser
 * can play it without CORS / mixed-content issues.
 *
 * Uses Node.js runtime (AWS Lambda) instead of Edge (Cloudflare) because
 * many IPTV providers block Cloudflare IP ranges.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

/* ── helpers ── */

function normalizeUrl(value: string): string {
  return value.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Connection: 'keep-alive',
};

/** Try fetching a URL with auto-redirect following */
async function tryFetch(
  targetUrl: string,
  timeoutMs = 20000,
): Promise<Response | null> {
  try {
    const url = normalizeUrl(targetUrl);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: HEADERS,
    });
    if (res.ok) return res;
  } catch { /* blocked, timeout, or network error */ }
  return null;
}

/** Try fetching via the Oracle VM scanner proxy */
async function fetchViaScanner(targetUrl: string): Promise<Response | null> {
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
  } catch { /* scanner unreachable */ }
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

    // Strategy 1: Scanner service (residential IP tunnel)
    upstream = await fetchViaScanner(targetUrl);

    // Strategy 2: HTTPS upgrade (avoids mixed-content and some servers prefer it)
    if (!upstream && targetUrl.startsWith('http://')) {
      upstream = await tryFetch(targetUrl.replace('http://', 'https://'), 12000);
    }

    // Strategy 3: Direct fetch with original URL
    if (!upstream) {
      upstream = await tryFetch(targetUrl, 20000);
    }

    if (!upstream) {
      return NextResponse.json({ error: 'Stream unavailable' }, { status: 502 });
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

          return `/api/stream?url=${encodeURIComponent(originalUrl)}`;
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


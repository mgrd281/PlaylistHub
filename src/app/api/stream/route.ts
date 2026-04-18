import { type NextRequest, NextResponse } from 'next/server';

/**
 * HLS stream proxy.
 * When running locally (next dev): direct fetch works (residential IP).
 * On Vercel: tries Oracle VM scanner first, then direct.
 * Handles 302 redirects, bare-% URL normalization, manifest rewriting.
 */
export const runtime = 'edge';

/* ── helpers ── */

function normalizeUrl(value: string): string {
  return value.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

async function fetchWithRedirects(
  inputUrl: string,
  headers: Record<string, string>,
  timeoutMs = 20000,
  maxRedirects = 8,
): Promise<Response> {
  let currentUrl = normalizeUrl(inputUrl);

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
      headers,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      const normalized = normalizeUrl(location);
      currentUrl = normalizeUrl(new URL(normalized, currentUrl).href);
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects');
}

const HEADERS: Record<string, string> = {
  'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
  Accept: '*/*',
};

/** Try fetching via the Oracle VM scanner proxy (Vercel only) */
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

    // Strategy 1: Scanner service (tunnel to local machine — bypasses IP blocks)
    upstream = await fetchViaScanner(targetUrl);

    // Strategy 2: Direct fetch (fallback — works locally or for non-blocking providers)
    if (!upstream) {
      try {
        const attempt = await fetchWithRedirects(targetUrl, HEADERS, 15000);
        if (attempt.ok) upstream = attempt;
      } catch { /* blocked or timeout */ }
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

          // Scanner rewrites lines as /stream?url=<encoded> — extract original URL
          let originalUrl: string;
          const scannerMatch = trimmed.match(/^\/stream\?url=(.+)$/);
          if (scannerMatch) {
            originalUrl = decodeURIComponent(scannerMatch[1]);
          } else {
            originalUrl = trimmed.startsWith('http')
              ? trimmed
              : new URL(trimmed, baseUrl).href;
          }

          // All URLs go through /api/stream for reliable scanner→direct fallback
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

    // Binary (segments / VOD) — stream through directly
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


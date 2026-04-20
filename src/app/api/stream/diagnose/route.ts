import { type NextRequest, NextResponse } from 'next/server';

/**
 * Stream proxy diagnostics — probe every strategy individually and report
 * configuration + live reachability. Used by the player's error overlay
 * and by humans pasting a URL into the browser.
 */
export const runtime = 'edge';

const VLC_HEADERS: Record<string, string> = {
  'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
  Accept: '*/*',
};

type StrategyResult = {
  name: string;
  configured: boolean;
  endpoint?: string;
  status?: number;
  ok: boolean;
  durationMs?: number;
  error?: string;
  contentType?: string;
  bodyPreview?: string;
  hint?: string;
};

async function probe(
  name: string,
  endpoint: string,
  opts: { authToken?: string } = {},
): Promise<StrategyResult> {
  const started = Date.now();
  try {
    const headers: Record<string, string> = { ...VLC_HEADERS };
    if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`;
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(7000),
      headers,
      redirect: 'follow',
    });
    const durationMs = Date.now() - started;
    const contentType = res.headers.get('content-type') ?? '';
    let bodyPreview: string | undefined;
    try {
      bodyPreview = (await res.clone().text()).slice(0, 240).trim();
    } catch { /* ignore */ }

    let hint: string | undefined;
    if (res.status === 401 || res.status === 403) {
      hint = 'Auth rejected — token mismatch or host not in allowlist';
    } else if (res.status === 404) {
      hint = 'Endpoint not found — URL stale or worker not deployed';
    } else if (res.status === 502 || res.status === 504) {
      hint = 'Upstream server unreachable';
    } else if (bodyPreview?.toLowerCase().includes('host not in allowlist')) {
      hint = 'Worker allowlist blocks this IPTV host';
    }

    return {
      name,
      configured: true,
      endpoint: maskUrl(endpoint),
      status: res.status,
      ok: res.ok || res.status === 206,
      durationMs,
      contentType,
      bodyPreview,
      hint,
    };
  } catch (err) {
    return {
      name,
      configured: true,
      endpoint: maskUrl(endpoint),
      ok: false,
      durationMs: Date.now() - started,
      error: (err as Error).name === 'TimeoutError' ? 'Request timed out (7s)' : String(err),
    };
  }
}

/** Hide credential-looking path segments from URLs so the report is safe to share */
function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // For /live/<user>/<pass>/<id>.ext style IPTV URLs
    u.pathname = u.pathname.replace(/\/([^/]+)\/([^/]+)\/(\d+)(\.\w+)?$/, '/***/***/$3$4');
    return u.toString();
  } catch {
    return raw;
  }
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json(
      {
        error: 'Missing url param',
        usage: '/api/stream/diagnose?url=<encoded-stream-url>',
      },
      { status: 400 },
    );
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const scannerApi = process.env.SCANNER_API_URL?.trim().replace(/\/$/, '');
  const scannerStream = process.env.SCANNER_STREAM_URL?.trim().replace(/\/$/, '');
  const cfWorker = process.env.STREAM_PROXY_URL?.trim().replace(/\/$/, '');
  const token = process.env.SCANNER_API_TOKEN?.trim() || undefined;

  const tests: StrategyResult[] = [];

  if (scannerApi) {
    tests.push(
      await probe(
        'Scanner API',
        `${scannerApi}/stream?url=${encodeURIComponent(targetUrl)}`,
        { authToken: token },
      ),
    );
  } else {
    tests.push({
      name: 'Scanner API',
      configured: false,
      ok: false,
      error: 'SCANNER_API_URL environment variable not set',
    });
  }

  if (scannerStream && scannerStream !== scannerApi) {
    tests.push(
      await probe(
        'Scanner Stream',
        `${scannerStream}/stream?url=${encodeURIComponent(targetUrl)}`,
        { authToken: token },
      ),
    );
  } else if (!scannerStream) {
    tests.push({
      name: 'Scanner Stream',
      configured: false,
      ok: false,
      error: 'SCANNER_STREAM_URL environment variable not set',
    });
  }

  if (cfWorker) {
    const separator = cfWorker.includes('?') ? '&' : '?';
    tests.push(
      await probe(
        'CF Worker (your STREAM_PROXY_URL)',
        `${cfWorker}${separator}url=${encodeURIComponent(targetUrl)}`,
      ),
    );
  } else {
    tests.push({
      name: 'CF Worker (your STREAM_PROXY_URL)',
      configured: false,
      ok: false,
      error: 'STREAM_PROXY_URL environment variable not set',
      hint: 'Deploy cf-proxy/worker.js to Cloudflare Workers and set this var',
    });
  }

  tests.push(
    await probe(
      'CF Worker (public fallback)',
      `https://iptv-proxy.karinexshop.workers.dev/?url=${encodeURIComponent(targetUrl)}`,
    ),
  );

  tests.push(await probe('Direct (Vercel Edge → IPTV)', targetUrl));

  const working = tests.filter(t => t.ok).length;

  return NextResponse.json(
    {
      target: maskUrl(targetUrl),
      region: req.headers.get('x-vercel-ip-country') ?? 'unknown',
      timestamp: new Date().toISOString(),
      summary: {
        total: tests.length,
        working,
        verdict:
          working > 0
            ? 'At least one strategy works — stream should play'
            : 'No proxy strategy works for this URL — see hints below',
      },
      strategies: tests,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

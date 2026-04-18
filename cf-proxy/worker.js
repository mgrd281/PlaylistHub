/**
 * Cloudflare Worker — IPTV Stream Proxy
 *
 * Proxies IPTV streams through Cloudflare's edge network.
 * Cloudflare edge IPs are almost never blocked by IPTV providers
 * (blocking CF would break a large portion of the internet).
 *
 * Deploy: https://workers.cloudflare.com/ → Create Worker → paste this code
 * Then set STREAM_PROXY_URL on Vercel to: https://your-worker.your-subdomain.workers.dev
 *
 * Free tier: 100,000 requests/day
 */

const ALLOWED_ORIGINS = ['*']; // Restrict to your domain in production
const PROXY_TOKEN = ''; // Set a token to protect the proxy (optional)

const VLC_HEADERS = {
  'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
  Accept: '*/*',
  'Icy-MetaData': '1',
};

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return jsonResponse({ error: 'Missing url param' }, 400, request);
    }

    // Token check (if configured)
    if (PROXY_TOKEN) {
      const token = request.headers.get('X-Proxy-Token');
      if (token !== PROXY_TOKEN) {
        return jsonResponse({ error: 'Unauthorized' }, 401, request);
      }
    }

    // Validate URL
    let parsed;
    try {
      parsed = new URL(decodeURIComponent(targetUrl));
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400, request);
    }

    const decodedUrl = decodeURIComponent(targetUrl);

    try {
      // Fetch the IPTV stream — handle redirects manually to deal with blocked IPs
      let finalUrl = decodedUrl;
      let upstream = null;
      let redirectCount = 0;
      const MAX_REDIRECTS = 5;

      while (redirectCount < MAX_REDIRECTS) {
        const res = await fetch(finalUrl, {
          headers: VLC_HEADERS,
          redirect: 'manual', // Don't auto-follow — we handle redirects ourselves
          cf: { cacheTtl: 0, cacheEverything: false },
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location) break;
          // Resolve relative redirects
          finalUrl = location.startsWith('http') ? location : new URL(location, finalUrl).href;
          redirectCount++;
          continue;
        }

        upstream = res;
        break;
      }

      if (!upstream || (!upstream.ok && upstream.status !== 206)) {
        // If redirect chain failed (e.g., 403 on IP), try connecting through Cloudflare's own fetch 
        // which follows redirects in its network (may work if the domain is behind CF)
        try {
          const fallback = await fetch(decodedUrl, {
            headers: VLC_HEADERS,
            redirect: 'follow',
            cf: { cacheTtl: 0, cacheEverything: false },
          });
          if (fallback.ok || fallback.status === 206) {
            upstream = fallback;
          }
        } catch { /* ignore */ }
      }

      if (!upstream || (!upstream.ok && upstream.status !== 206)) {
        const status = upstream ? upstream.status : 0;
        return jsonResponse(
          { error: `Upstream returned ${status}`, finalUrl, redirects: redirectCount },
          502,
          request,
        );
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const isManifest =
        contentType.includes('mpegurl') || /\.m3u8/i.test(decodedUrl);

      if (isManifest) {
        // Rewrite HLS manifest URLs to go through this proxy
        const text = await upstream.text();
        const workerBase = url.origin;
        const baseUrl = decodedUrl;

        const rewritten = text
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            const absUrl = trimmed.startsWith('http')
              ? trimmed
              : new URL(trimmed, baseUrl).href;
            return `${workerBase}/?url=${encodeURIComponent(absUrl)}`;
          })
          .join('\n');

        return new Response(rewritten, {
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            ...corsHeaders(request),
            'Cache-Control': 'no-store',
          },
        });
      }

      // Stream binary content through
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': contentType,
          ...corsHeaders(request),
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 502, request);
    }
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0] === '*' ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Proxy-Token, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

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

/** Build fetch headers — merge VLC UA with client Range header */
function buildUpstreamHeaders(request) {
  const headers = { ...VLC_HEADERS };
  const range = request.headers.get('Range');
  if (range) headers['Range'] = range;
  return headers;
}

function isManifestRequest(url) {
  return /\.m3u8?(?:[?#]|$)/i.test(url);
}

function hasClearlyNonMediaType(contentType) {
  return (
    contentType.includes('text/html') ||
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml')
  );
}

async function isUsableStreamPayload(response, targetUrl) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (hasClearlyNonMediaType(contentType)) return false;

  const manifestExpected = isManifestRequest(targetUrl) || contentType.includes('mpegurl');
  if (manifestExpected) {
    try {
      const preview = (await response.clone().text()).slice(0, 8192).trimStart();
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

  if (contentType.startsWith('text/')) {
    try {
      const preview = (await response.clone().text()).slice(0, 2048).toLowerCase();
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

      const upstreamHeaders = buildUpstreamHeaders(request);

      while (redirectCount < MAX_REDIRECTS) {
        const res = await fetch(finalUrl, {
          headers: upstreamHeaders,
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
            headers: upstreamHeaders,
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

      if (!await isUsableStreamPayload(upstream, decodedUrl)) {
        return jsonResponse(
          { error: 'Upstream returned non-media payload', finalUrl, redirects: redirectCount },
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
            if (!trimmed) return line;
            // Rewrite URI="..." attributes in tags like #EXT-X-MAP
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
                const absUrl = uri.startsWith('http') ? uri : new URL(uri, baseUrl).href;
                return `URI="${workerBase}/?url=${encodeURIComponent(absUrl)}"`;
              });
            }
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

      // Stream binary content through — preserve Range response headers for MP4 seeking
      const responseHeaders = {
        'Content-Type': contentType,
        ...corsHeaders(request),
        'Cache-Control': 'no-store',
        'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
      };
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      if (cl) responseHeaders['Content-Length'] = cl;
      if (cr) responseHeaders['Content-Range'] = cr;

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
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
    'Access-Control-Allow-Headers': 'X-Proxy-Token, Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
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

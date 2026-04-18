import http from 'node:http';
import { ProxyAgent } from 'undici';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT || 8787);
const ENFORCE_TOKEN = process.env.SCANNER_API_ENFORCE_TOKEN === 'true';
const UPSTREAM_PROXY_URL = String(process.env.SCANNER_UPSTREAM_PROXY_URL || '').trim();
const TOKENS = String(process.env.SCANNER_API_TOKEN || '')
  .split(/[\s,]+/)
  .map((t) => t.trim())
  .filter(Boolean);
const proxyAgent = UPSTREAM_PROXY_URL ? new ProxyAgent(UPSTREAM_PROXY_URL) : null;

// Tunnel URL — read from env or from /tmp/tunnel.log at startup
let tunnelUrl = String(process.env.SCANNER_STREAM_URL || '').trim();
if (!tunnelUrl) {
  try {
    const log = readFileSync('/tmp/tunnel.log', 'utf8');
    const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) tunnelUrl = match[0];
  } catch { /* no tunnel log yet */ }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function getXtreamCredentials(targetUrl) {
  try {
    const url = new URL(targetUrl);
    const username = url.searchParams.get('username');
    const password = url.searchParams.get('password');
    if (!username || !password) return null;
    return { url, username, password };
  } catch {
    return null;
  }
}

async function buildXtreamM3U(targetUrl) {
  const creds = getXtreamCredentials(targetUrl);
  if (!creds) return null;

  const { url, username, password } = creds;
  const encodedUsername = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);
  const baseUrl = `${url.protocol}//${url.host}`;
  const apiBase = `${baseUrl}/player_api.php?username=${encodedUsername}&password=${encodedPassword}`;

  const requestInitBase = {
    signal: AbortSignal.timeout(25000),
    headers: {
      'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
      Accept: '*/*',
    },
    ...(proxyAgent ? { dispatcher: proxyAgent } : {}),
  };

  const authRes = await fetch(apiBase, requestInitBase);
  if (!authRes.ok) return null;

  const [liveRes, vodRes, seriesRes] = await Promise.allSettled([
    fetch(`${apiBase}&action=get_live_streams`, requestInitBase),
    fetch(`${apiBase}&action=get_vod_streams`, requestInitBase),
    fetch(`${apiBase}&action=get_series`, requestInitBase),
  ]);

  const lines = ['#EXTM3U'];

  if (liveRes.status === 'fulfilled' && liveRes.value.ok) {
    const streams = await liveRes.value.json();
    if (Array.isArray(streams)) {
      for (const s of streams) {
        const name = s?.name || 'Unknown';
        const logo = s?.stream_icon || '';
        const group = s?.category_id || '';
        const tvgId = s?.epg_channel_id || '';
        lines.push(`#EXTINF:-1 tvg-id="${tvgId}" tvg-logo="${logo}" group-title="${group}",${name}`);
        lines.push(`${baseUrl}/live/${encodedUsername}/${encodedPassword}/${s?.stream_id}.m3u8`);
      }
    }
  }

  if (vodRes.status === 'fulfilled' && vodRes.value.ok) {
    const vods = await vodRes.value.json();
    if (Array.isArray(vods)) {
      for (const v of vods) {
        const name = v?.name || 'Unknown';
        const logo = v?.stream_icon || '';
        const group = v?.category_id || 'VOD';
        const ext = v?.container_extension || 'mp4';
        lines.push(`#EXTINF:-1 tvg-logo="${logo}" group-title="${group}",${name}`);
        lines.push(`${baseUrl}/movie/${encodedUsername}/${encodedPassword}/${v?.stream_id}.${ext}`);
      }
    }
  }

  if (seriesRes.status === 'fulfilled' && seriesRes.value.ok) {
    const series = await seriesRes.value.json();
    if (Array.isArray(series)) {
      for (const s of series) {
        const name = s?.name || 'Unknown';
        const logo = s?.cover || '';
        const group = s?.category_id || 'Series';
        lines.push(`#EXTINF:-1 tvg-logo="${logo}" group-title="${group}",${name}`);
        lines.push(`${baseUrl}/series/${encodedUsername}/${encodedPassword}/${s?.series_id}.ts`);
      }
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function getBearerToken(headerValue) {
  if (!headerValue) return '';
  const [scheme, token] = String(headerValue).split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return '';
  return token || '';
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeUrlForFetch(value) {
  // Some IPTV providers return tokenized URLs containing bare '%' chars.
  // WHATWG URL parsing rejects these unless they are escaped.
  return String(value).replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

async function fetchWithManualRedirects(inputUrl, headers, timeoutMs = 30000, maxRedirects = 8) {
  let currentUrl = normalizeUrlForFetch(inputUrl);

  for (let i = 0; i <= maxRedirects; i += 1) {
    const response = await fetch(currentUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
      headers,
      ...(proxyAgent ? { dispatcher: proxyAgent } : {}),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      const normalizedLocation = normalizeUrlForFetch(location);
      const resolved = new URL(normalizedLocation, currentUrl).href;
      currentUrl = normalizeUrlForFetch(resolved);
      continue;
    }

    return response;
  }

  throw new Error('Too many redirects');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'playlist-scanner', tunnelUrl: tunnelUrl || null });
  }

  // Stream proxy: fetches any URL and returns raw content (resolves .m3u8 redirects)
  if (req.method === 'GET' && url.pathname === '/stream') {
    try {
      if (ENFORCE_TOKEN && TOKENS.length > 0) {
        const incoming =
          getBearerToken(req.headers.authorization) ||
          String(url.searchParams.get('token') || '').trim();
        if (!incoming || !TOKENS.includes(incoming)) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
      }

      const targetUrlRaw = url.searchParams.get('url');
      const targetUrl = normalizeUrlForFetch(targetUrlRaw || '');
      if (!targetUrlRaw || !isValidHttpUrl(targetUrl)) {
        return sendJson(res, 400, { error: 'Invalid url' });
      }

      const target = new URL(targetUrl);
      const browserOrigin = `${target.protocol}//${target.host}`;
      const headerProfiles = [
        {
          'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
          Accept: '*/*',
        },
        {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `${browserOrigin}/`,
          Origin: browserOrigin,
          Connection: 'keep-alive',
        },
      ];

      let upstream = null;
      let lastStatus = 0;

      for (const headers of headerProfiles) {
        const attempt = await fetchWithManualRedirects(targetUrl, headers, 30000);

        lastStatus = attempt.status;
        if (attempt.ok) {
          upstream = attempt;
          break;
        }
      }

      if (!upstream) {
        return sendJson(res, lastStatus || 502, { error: `Upstream error ${lastStatus || 'unknown'}` });
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const isManifest =
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl') ||
        /\.m3u8?(?:[?#]|$)/i.test(targetUrl);

      if (isManifest) {
        const text = await upstream.text();
        // Use final URL after redirects to resolve relative segment paths
        const base = new URL(upstream.url || targetUrl);
        const rewritten = text
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            const absolute = trimmed.startsWith('http') ? trimmed : new URL(trimmed, base).href;
            return `/stream?url=${encodeURIComponent(absolute)}`;
          })
          .join('\n');
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
          'Cache-Control': 'no-store',
        });
        res.end(rewritten);
        return;
      }

      // Binary pass-through for .ts segments, .mp4, etc.
      res.writeHead(upstream.status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
        'Cache-Control': 'no-store',
      });
      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        await pump();
      } else {
        res.end();
      }
    } catch (error) {
      if (!res.headersSent) {
        return sendJson(res, 502, { error: error instanceof Error ? error.message : 'Stream error' });
      }
      res.end();
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/fetch') {
    try {
      if (ENFORCE_TOKEN && TOKENS.length > 0) {
        const incoming = getBearerToken(req.headers.authorization);
        if (!incoming || !TOKENS.includes(incoming)) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
      }

      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const targetUrl = String(payload.url || '').trim();

      if (!targetUrl || !isValidHttpUrl(targetUrl)) {
        return sendJson(res, 400, { error: 'Invalid url' });
      }

      // Prefer Xtream API generation when username/password are present.
      try {
        const xtreamContent = await buildXtreamM3U(targetUrl);
        if (xtreamContent) {
          return sendJson(res, 200, { content: xtreamContent, source: 'xtream-api' });
        }
      } catch {
        // Fallback to direct upstream fetch strategy below.
      }

      const target = new URL(targetUrl);
      const browserOrigin = `${target.protocol}//${target.host}`;
      const headerProfiles = [
        {
          'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
          Accept: '*/*',
        },
        {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `${browserOrigin}/`,
          Origin: browserOrigin,
          Connection: 'keep-alive',
        },
      ];

      let response = null;
      let lastStatus = 0;

      for (const headers of headerProfiles) {
        const attempt = await fetch(targetUrl, {
          signal: AbortSignal.timeout(45000),
          redirect: 'follow',
          headers,
          ...(proxyAgent ? { dispatcher: proxyAgent } : {}),
        });

        lastStatus = attempt.status;
        if (attempt.ok) {
          response = attempt;
          break;
        }
      }

      if (!response) {
        return sendJson(res, 502, { error: `Upstream error ${lastStatus || 'unknown'}` });
      }

      const content = await response.text();
      if (!content || content.trim().length === 0) {
        return sendJson(res, 502, { error: 'Empty upstream content' });
      }

      return sendJson(res, 200, { content });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return sendJson(res, 500, { error: message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(
    `Scanner service listening on port ${PORT} (auth ${ENFORCE_TOKEN && TOKENS.length > 0 ? 'enabled' : 'disabled'}, proxy ${proxyAgent ? 'enabled' : 'disabled'})`
  );
});

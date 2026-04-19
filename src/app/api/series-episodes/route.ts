import { type NextRequest, NextResponse } from 'next/server';

/**
 * Resolves episodes for a series item using the Xtream Codes API.
 * Uses Edge runtime → Cloudflare network (different IPs than AWS Lambda).
 */
export const runtime = 'edge';

interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  streamUrl: string;
  info?: { duration?: string; plot?: string; rating?: string };
}

interface Season {
  season: number;
  episodes: Episode[];
}

function extractXtreamInfo(streamUrl: string) {
  const match = streamUrl.match(
    /^(https?:\/\/[^/]+)\/series\/([^/]+)\/([^/]+)\/(\d+)\.\w+$/
  );
  if (!match) return null;
  return { baseUrl: match[1], username: match[2], password: match[3], seriesId: match[4] };
}

async function fetchJson(url: string, timeoutMs = 15000): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21' },
    });
    if (res.ok) return await res.json() as Record<string, unknown>;
  } catch { /* failed */ }
  return null;
}

export async function GET(req: NextRequest) {
  const streamUrl = req.nextUrl.searchParams.get('url');
  if (!streamUrl) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  const info = extractXtreamInfo(streamUrl);
  if (!info) {
    return NextResponse.json({ error: 'Not a valid Xtream series URL' }, { status: 400 });
  }

  const { baseUrl, username, password, seriesId } = info;
  const apiUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${seriesId}`;
  const errors: string[] = [];
  let data: Record<string, unknown> | null = null;

  // 1. External proxy (Cloudflare Worker / Scanner)
  const configuredProxyUrl = process.env.STREAM_PROXY_URL?.trim().replace(/\/$/, '');
  const proxyCandidates = [
    configuredProxyUrl,
    // Fallback worker endpoint to survive stale env config
    'https://iptv-proxy.karinexshop.workers.dev',
  ].filter(Boolean) as string[];

  if (proxyCandidates.length > 0) {
    for (const proxyUrl of proxyCandidates) {
      if (data) break;
      try {
        const sep = proxyUrl.includes('?') ? '&' : '?';
        const headers: Record<string, string> = {};
        const token = process.env.STREAM_PROXY_TOKEN;
        if (token) headers['X-Proxy-Token'] = token;
        const res = await fetch(`${proxyUrl}${sep}url=${encodeURIComponent(apiUrl)}`, {
          signal: AbortSignal.timeout(15000), headers,
        });
        if (res.ok) data = await res.json() as Record<string, unknown>;
        else errors.push(`proxy(${proxyUrl}): HTTP ${res.status}`);
      } catch { errors.push(`proxy(${proxyUrl}): unavailable`); }
    }
  } else {
    errors.push('proxy: not configured');
  }

  // 2. Direct fetch with VLC UA
  if (!data) {
    data = await fetchJson(apiUrl);
    if (!data) errors.push('direct: failed');
  }

  // 3. HTTPS upgrade
  if (!data && baseUrl.startsWith('http://')) {
    data = await fetchJson(apiUrl.replace('http://', 'https://'), 10000);
    if (!data) errors.push('https: failed');
  }

  if (!data) {
    return NextResponse.json({ error: 'تعذّر تحميل حلقات المسلسل', details: errors }, { status: 502 });
  }

  const episodes = data.episodes as Record<string, Array<{
    id?: string; title?: string; episode_num?: number;
    season?: number; container_extension?: string;
    info?: { duration?: string; plot?: string; rating?: string };
  }>> | undefined;

  if (!episodes || typeof episodes !== 'object') {
    return NextResponse.json({ error: 'No episodes found' }, { status: 404 });
  }

  const seasons: Season[] = [];
  for (const [seasonNum, eps] of Object.entries(episodes)) {
    if (!Array.isArray(eps)) continue;
    seasons.push({
      season: parseInt(seasonNum) || 0,
      episodes: eps.map((ep) => ({
        id: String(ep.id || ''),
        title: ep.title || `Episode ${ep.episode_num || '?'}`,
        season: ep.season || parseInt(seasonNum) || 0,
        episode: ep.episode_num || 0,
        streamUrl: `${baseUrl}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${ep.id}.${ep.container_extension || 'mp4'}`,
        info: ep.info,
      })),
    });
  }
  seasons.sort((a, b) => a.season - b.season);

  return NextResponse.json({
    seriesId,
    seriesName: (data.info as Record<string, unknown>)?.name || '',
    seasons,
  });
}

import { type NextRequest, NextResponse } from 'next/server';

/**
 * Resolves episodes for a series item using the Xtream Codes API.
 * Extracts credentials from the series stream_url, calls get_series_info,
 * and returns episodes with playable URLs.
 */

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
  // Pattern: http://host:port/series/username/password/stream_id.ext
  const match = streamUrl.match(
    /^(https?:\/\/[^/]+)\/series\/([^/]+)\/([^/]+)\/(\d+)\.\w+$/
  );
  if (!match) return null;
  return {
    baseUrl: match[1],
    username: match[2],
    password: match[3],
    seriesId: match[4],
  };
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

  try {
    // Use scanner to bypass IP blocks
    const scannerUrl = process.env.SCANNER_API_URL?.trim().replace(/\/$/, '');
    const apiUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${seriesId}`;
    // Also try HTTPS version if original is HTTP (many Xtream panels support both)
    const apiUrlHttps = baseUrl.startsWith('http://') ? apiUrl.replace('http://', 'https://') : null;

    let data: Record<string, unknown> | null = null;

    // Strategy 1: Try scanner service (bypasses IP blocks)
    if (scannerUrl) {
      try {
        const res = await fetch(
          `${scannerUrl}/stream?url=${encodeURIComponent(apiUrl)}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (res.ok) data = await res.json() as Record<string, unknown>;
      } catch { /* scanner unavailable */ }
    }

    // Strategy 2: Direct fetch with HTTPS upgrade
    if (!data && apiUrlHttps) {
      try {
        const res = await fetch(apiUrlHttps, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21' },
        });
        if (res.ok) data = await res.json() as Record<string, unknown>;
      } catch { /* HTTPS not supported by this server */ }
    }

    // Strategy 3: Direct fetch with original URL
    if (!data) {
      const res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21' },
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      data = await res.json() as Record<string, unknown>;
    }

    const episodes = data.episodes as Record<string, Array<{
      id?: string;
      title?: string;
      episode_num?: number;
      season?: number;
      container_extension?: string;
      info?: { duration?: string; plot?: string; rating?: string };
    }>> | undefined;

    if (!episodes || typeof episodes !== 'object') {
      return NextResponse.json({ error: 'No episodes found' }, { status: 404 });
    }

    const seasons: Season[] = [];
    for (const [seasonNum, eps] of Object.entries(episodes)) {
      if (!Array.isArray(eps)) continue;
      const season: Season = {
        season: parseInt(seasonNum) || 0,
        episodes: eps.map((ep) => ({
          id: String(ep.id || ''),
          title: ep.title || `Episode ${ep.episode_num || '?'}`,
          season: ep.season || parseInt(seasonNum) || 0,
          episode: ep.episode_num || 0,
          streamUrl: `${baseUrl}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${ep.id}.${ep.container_extension || 'mp4'}`,
          info: ep.info,
        })),
      };
      seasons.push(season);
    }

    seasons.sort((a, b) => a.season - b.season);

    return NextResponse.json({
      seriesId,
      seriesName: (data.info as Record<string, unknown>)?.name || '',
      seasons,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 502 },
    );
  }
}

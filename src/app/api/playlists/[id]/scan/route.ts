import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { parseM3U } from '@/lib/parser';

export const maxDuration = 60;

interface ExternalScannerResult {
  content: string | null;
  error?: string;
}

async function tryExternalScanner(sourceUrl: string): Promise<ExternalScannerResult> {
  const scannerBaseUrl = process.env.SCANNER_API_URL;
  if (!scannerBaseUrl) return { content: null, error: 'not configured' };

  try {
    const endpoint = new URL('/fetch', scannerBaseUrl).toString();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (process.env.SCANNER_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.SCANNER_API_TOKEN}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: sourceUrl }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null) as { error?: unknown } | null;
      const reason = typeof payload?.error === 'string' ? payload.error : `HTTP ${res.status}`;
      return { content: null, error: reason };
    }

    const data = await res.json().catch(() => null) as { content?: unknown } | null;
    if (typeof data?.content !== 'string' || data.content.trim().length === 0) {
      return { content: null, error: 'empty response' };
    }

    // Reject non-M3U content (e.g. HTML pages from blocking servers)
    const trimmed = data.content.trim();
    if (!trimmed.startsWith('#EXTM3U') && !trimmed.includes('#EXTINF:')) {
      return { content: null, error: 'not M3U content' };
    }

    return { content: data.content };
  } catch {
    return { content: null, error: 'request failed' };
  }
}

// Extract Xtream Codes credentials from URL and build M3U from API
async function tryXtreamCodesAPI(sourceUrl: string): Promise<string | null> {
  try {
    const url = new URL(sourceUrl);
    const username = url.searchParams.get('username');
    const password = url.searchParams.get('password');
    if (!username || !password) return null;

    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);

    const baseUrl = `${url.protocol}//${url.host}`;
    const apiBase = `${baseUrl}/player_api.php?username=${encodedUsername}&password=${encodedPassword}`;

    // Test auth first
    const authRes = await fetch(apiBase, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21' },
    });
    if (!authRes.ok) return null;

    // Fetch live streams, VOD, and series in parallel
    const [liveRes, vodRes, seriesRes] = await Promise.allSettled([
      fetch(`${apiBase}&action=get_live_streams`, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21' },
      }),
      fetch(`${apiBase}&action=get_vod_streams`, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21' },
      }),
      fetch(`${apiBase}&action=get_series`, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21' },
      }),
    ]);

    const lines: string[] = ['#EXTM3U'];

    // Process live streams
    if (liveRes.status === 'fulfilled' && liveRes.value.ok) {
      const streams = await liveRes.value.json() as Array<{
        name?: string; stream_id?: number; stream_icon?: string;
        category_id?: string; epg_channel_id?: string;
      }>;
      if (Array.isArray(streams)) {
        for (const s of streams) {
          const name = s.name || 'Unknown';
          const logo = s.stream_icon || '';
          const group = s.category_id || '';
          const tvgId = s.epg_channel_id || '';
          lines.push(`#EXTINF:-1 tvg-id="${tvgId}" tvg-logo="${logo}" group-title="${group}",${name}`);
          lines.push(`${baseUrl}/live/${encodedUsername}/${encodedPassword}/${s.stream_id}.ts`);
        }
      }
    }

    // Process VOD
    if (vodRes.status === 'fulfilled' && vodRes.value.ok) {
      const vods = await vodRes.value.json() as Array<{
        name?: string; stream_id?: number; stream_icon?: string;
        category_id?: string; container_extension?: string;
      }>;
      if (Array.isArray(vods)) {
        for (const v of vods) {
          const name = v.name || 'Unknown';
          const logo = v.stream_icon || '';
          const group = v.category_id || 'VOD';
          const ext = v.container_extension || 'mp4';
          lines.push(`#EXTINF:-1 tvg-logo="${logo}" group-title="${group}",${name}`);
          lines.push(`${baseUrl}/movie/${encodedUsername}/${encodedPassword}/${v.stream_id}.${ext}`);
        }
      }
    }

    // Process Series
    if (seriesRes.status === 'fulfilled' && seriesRes.value.ok) {
      const series = await seriesRes.value.json() as Array<{
        name?: string; series_id?: number; cover?: string; category_id?: string;
      }>;
      if (Array.isArray(series)) {
        for (const s of series) {
          const name = s.name || 'Unknown';
          const logo = s.cover || '';
          const group = s.category_id || 'Series';
          lines.push(`#EXTINF:-1 tvg-logo="${logo}" group-title="${group}",${name}`);
          lines.push(`${baseUrl}/series/${encodedUsername}/${encodedPassword}/${s.series_id}.ts`);
        }
      }
    }

    if (lines.length <= 1) return null;
    return lines.join('\n');
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify playlist ownership and get source URL
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (playlistError || !playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    // Update playlist status to scanning
    await supabase
      .from('playlists')
      .update({ status: 'scanning' })
      .eq('id', id);

    // Create scan record
    const { data: scan, error: scanError } = await supabase
      .from('playlist_scans')
      .insert({
        playlist_id: id,
        status: 'running',
      })
      .select()
      .single();

    if (scanError || !scan) {
      await supabase
        .from('playlists')
        .update({ status: 'error', error_message: 'Failed to create scan record' })
        .eq('id', id);
      return NextResponse.json({ error: 'Failed to create scan record' }, { status: 500 });
    }

    try {
      let content: string;

      // Check if content was sent from client (client-side fetch)
      const body = await request.json().catch(() => null);
      if (body?.content) {
        content = body.content;
      } else {
        // Try multiple fetch strategies
        let fetchError = '';
        let fetched: string | null = null;

        // Strategy 1: External scanner service (URL-only mode)
        if (!fetched) {
          const scannerResult = await tryExternalScanner(playlist.source_url);
          if (scannerResult.content) {
            fetched = scannerResult.content;
          } else {
            fetchError = `Scanner: ${scannerResult.error || 'unavailable'}`;
          }
        }

        // Strategy 2: Direct fetch with VLC User-Agent
        if (!fetched) {
          try {
            const res1 = await fetch(playlist.source_url, {
              signal: AbortSignal.timeout(15000),
              headers: {
                'User-Agent': 'VLC/3.0.21 LibVLC/3.0.21',
                'Accept': '*/*',
              },
              redirect: 'follow',
            });
            if (res1.ok) {
              const text = await res1.text();
              if (text.trim().startsWith('#EXTM3U') || text.includes('#EXTINF:')) {
                fetched = text;
              } else {
                fetchError += ', Direct: not M3U content';
              }
            } else {
              fetchError += `, Direct: ${res1.status}`;
            }
          } catch (e) {
            fetchError += `, Direct: ${e instanceof Error ? e.message : 'failed'}`;
          }
        }

        // Strategy 3: Try Xtream Codes API if URL matches pattern
        if (!fetched) {
          const xtreamContent = await tryXtreamCodesAPI(playlist.source_url);
          if (xtreamContent) {
            fetched = xtreamContent;
          } else {
            fetchError += ', Xtream: not available';
          }
        }

        // Strategy 4: Fetch via allorigins proxy
        if (!fetched) {
          try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(playlist.source_url)}`;
            const res2 = await fetch(proxyUrl, {
              signal: AbortSignal.timeout(30000),
            });
            if (res2.ok) {
              const text2 = await res2.text();
              if (text2.trim().startsWith('#EXTM3U') || text2.includes('#EXTINF:')) {
                fetched = text2;
              } else {
                fetchError += ', Proxy1: not M3U content';
              }
            } else {
              fetchError += `, Proxy1: ${res2.status}`;
            }
          } catch (e) {
            fetchError += `, Proxy1: ${e instanceof Error ? e.message : 'failed'}`;
          }
        }

        // Strategy 5: Fetch via corsproxy
        if (!fetched) {
          try {
            const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(playlist.source_url)}`;
            const res3 = await fetch(proxyUrl2, {
              signal: AbortSignal.timeout(30000),
            });
            if (res3.ok) {
              const text3 = await res3.text();
              if (text3.trim().startsWith('#EXTM3U') || text3.includes('#EXTINF:')) {
                fetched = text3;
              } else {
                fetchError += ', Proxy2: not M3U content';
              }
            } else {
              fetchError += `, Proxy2: ${res3.status}`;
            }
          } catch (e) {
            fetchError += `, Proxy2: ${e instanceof Error ? e.message : 'failed'}`;
          }
        }

        if (!fetched) {
          if (!process.env.SCANNER_API_URL) {
            throw new Error('SCANNER_REQUIRED_FOR_URL_ONLY');
          }
          const details = fetchError ? fetchError.replace(/^,\s*/, '') : 'No successful strategy';
          throw new Error(`FETCH_BLOCKED: ${details}`);
        }
        content = fetched;
      }

      if (!content || content.trim().length === 0) {
        throw new Error('Playlist URL returned empty content');
      }

      if (!content.trim().startsWith('#EXTM3U') && !content.includes('#EXTINF:')) {
        const preview = content.trim().substring(0, 100);
        throw new Error(`Invalid M3U format. Content starts with: ${preview}...`);
      }

      // Parse the content
      const result = parseM3U(content);

      // Delete existing items and categories for this playlist
      await supabase.from('playlist_items').delete().eq('playlist_id', id);
      await supabase.from('categories').delete().eq('playlist_id', id);

      // Insert categories
      const categoryMap = new Map<string, string>();
      if (result.categories.length > 0) {
        const categoryRows = result.categories.map(name => ({
          playlist_id: id,
          name,
          item_count: result.items.filter(i => i.groupTitle === name).length,
        }));

        // Insert in batches of 500
        for (let i = 0; i < categoryRows.length; i += 500) {
          const batch = categoryRows.slice(i, i + 500);
          const { data: cats } = await supabase
            .from('categories')
            .insert(batch)
            .select('id, name');

          if (cats) {
            cats.forEach(c => categoryMap.set(c.name, c.id));
          }
        }
      }

      // Insert items in batches
      if (result.items.length > 0) {
        const itemRows = result.items.map(item => ({
          playlist_id: id,
          scan_id: scan.id,
          category_id: item.groupTitle ? categoryMap.get(item.groupTitle) || null : null,
          name: item.name,
          stream_url: item.streamUrl,
          logo_url: item.logoUrl,
          group_title: item.groupTitle,
          content_type: item.contentType,
          tvg_id: item.tvgId,
          tvg_name: item.tvgName,
          tvg_logo: item.tvgLogo,
          metadata: item.metadata,
        }));

        for (let i = 0; i < itemRows.length; i += 500) {
          const batch = itemRows.slice(i, i + 500);
          await supabase.from('playlist_items').insert(batch);
        }
      }

      // Update scan as completed
      await supabase
        .from('playlist_scans')
        .update({
          status: 'completed',
          total_items: result.totalItems,
          channels_count: result.channelsCount,
          movies_count: result.moviesCount,
          series_count: result.seriesCount,
          categories_count: result.categoriesCount,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scan.id);

      // Update playlist with scan results
      await supabase
        .from('playlists')
        .update({
          status: 'active',
          total_items: result.totalItems,
          channels_count: result.channelsCount,
          movies_count: result.moviesCount,
          series_count: result.seriesCount,
          categories_count: result.categoriesCount,
          last_scan_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        scan_id: scan.id,
        total_items: result.totalItems,
        channels_count: result.channelsCount,
        movies_count: result.moviesCount,
        series_count: result.seriesCount,
        categories_count: result.categoriesCount,
      });
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Scan failed';

      await supabase
        .from('playlist_scans')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scan.id);

      await supabase
        .from('playlists')
        .update({
          status: 'error',
          error_message: errorMessage,
        })
        .eq('id', id);

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

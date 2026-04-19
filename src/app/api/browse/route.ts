import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Support both cookie auth (web) and Bearer token auth (iOS)
  const authHeader = request.headers.get('authorization');
  let supabase;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
  } else {
    supabase = await createClient();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const contentType = url.searchParams.get('type') || 'channel';
  const search = url.searchParams.get('search') || '';
  const group = url.searchParams.get('group') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '60'), 200);
  const offset = (page - 1) * limit;

  // Support scoping to a single playlist via ?playlist_id=
  const requestedPlaylistId = url.searchParams.get('playlist_id');

  // Get user's playlist IDs (or verify ownership of requested one)
  // Include active + scanning playlists (scanning playlists already have channels being inserted)
  const { data: playlists } = await supabase
    .from('playlists')
    .select('id, name, channels_count, status')
    .eq('user_id', user.id)
    .in('status', ['active', 'scanning']);

  const userPlaylists = playlists || [];
  let playlistIds: string[];

  if (requestedPlaylistId) {
    // Verify ownership — check active/scanning playlists first, then any owned playlist
    if (!userPlaylists.find(p => p.id === requestedPlaylistId)) {
      // Could be a fallback playlist (e.g. pending with channels) — verify ownership directly
      const { data: ownedPlaylist } = await supabase
        .from('playlists')
        .select('id')
        .eq('id', requestedPlaylistId)
        .eq('user_id', user.id)
        .single();
      if (!ownedPlaylist) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
      }
    }
    playlistIds = [requestedPlaylistId];
  } else {
    playlistIds = userPlaylists.map((p) => p.id);
  }

  // Mode: playlists — return the user's playlists with channel counts (for playlist picker)
  // If no active/scanning playlists, also check for any playlist that has channels (e.g. errored scans)
  const mode = url.searchParams.get('mode');
  if (mode === 'playlists') {
    let returnPlaylists = userPlaylists;
    if (returnPlaylists.length === 0) {
      // Fallback: find ANY playlist with channels_count > 0 regardless of status
      const { data: fallbackPlaylists } = await supabase
        .from('playlists')
        .select('id, name, channels_count, status')
        .eq('user_id', user.id)
        .gt('channels_count', 0);
      returnPlaylists = fallbackPlaylists || [];
    }
    return NextResponse.json({
      playlists: returnPlaylists.map(p => ({ id: p.id, name: p.name, channels_count: p.channels_count })),
    });
  }

  if (playlistIds.length === 0) {
    return NextResponse.json({
      items: [],
      groups: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    });
  }

  // Mode: groups — return distinct group_titles with counts
  if (mode === 'groups') {
    const { data: groupData } = await supabase
      .from('playlist_items')
      .select('group_title')
      .in('playlist_id', playlistIds)
      .eq('content_type', contentType)
      .not('group_title', 'is', null)
      .limit(50000);

    const counts = new Map<string, number>();
    for (const item of groupData || []) {
      const g = item.group_title || '';
      counts.set(g, (counts.get(g) || 0) + 1);
    }

    const groups = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ groups });
  }

  // Mode: grouped — return all items organized by group_title (for Live TV)
  if (mode === 'grouped') {
    const searchParam = url.searchParams.get('search') || '';
    let gQuery = supabase
      .from('playlist_items')
      .select('*')
      .in('playlist_id', playlistIds)
      .eq('content_type', contentType)
      // Keep provider/source sequence (scan insert order) instead of re-sorting by name.
      .order('created_at', { ascending: true })
      .limit(50000);

    if (searchParam) {
      gQuery = gQuery.or(`name.ilike.%${searchParam}%,group_title.ilike.%${searchParam}%`);
    }

    const { data: allItems, error: gError } = await gQuery;
    if (gError) {
      return NextResponse.json({ error: gError.message }, { status: 500 });
    }

    const grouped: Record<string, typeof allItems> = {};
    for (const item of allItems || []) {
      const g = item.group_title || 'Uncategorized';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(item);
    }

    // Preserve first-seen group order from source/provider data.
    const sections = Object.entries(grouped)
      .map(([name, items]) => ({ name, items, count: items.length }));

    return NextResponse.json({
      sections,
      total: (allItems || []).length,
      groupCount: sections.length,
    });
  }

  // Standard items query
  let query = supabase
    .from('playlist_items')
    .select('*', { count: 'exact' })
    .in('playlist_id', playlistIds)
    .eq('content_type', contentType);

  if (group) {
    query = query.eq('group_title', group);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,group_title.ilike.%${search}%`);
  }

  query = query.order('name', { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

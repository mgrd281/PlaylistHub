import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
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

  // Get user's playlist IDs
  const { data: playlists } = await supabase
    .from('playlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active');

  const playlistIds = (playlists || []).map((p) => p.id);

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
  const mode = url.searchParams.get('mode');
  if (mode === 'groups') {
    const { data: groupData } = await supabase
      .from('playlist_items')
      .select('group_title')
      .in('playlist_id', playlistIds)
      .eq('content_type', contentType)
      .not('group_title', 'is', null);

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
      .order('name', { ascending: true });

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

    const sections = Object.entries(grouped)
      .map(([name, items]) => ({ name, items, count: items.length }))
      .sort((a, b) => b.count - a.count);

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

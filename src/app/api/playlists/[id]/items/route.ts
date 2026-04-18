import { createClientFromRequest } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClientFromRequest(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify playlist ownership
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (playlistError || !playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');

    // ── Groups aggregation mode ──
    // Returns distinct group_titles with counts + sample names for classification
    if (mode === 'groups') {
      const contentType = url.searchParams.get('type') || 'channel';

      const { data, error } = await supabase
        .from('playlist_items')
        .select('name, group_title')
        .eq('playlist_id', id)
        .eq('content_type', contentType)
        .order('name')
        .limit(50000);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Aggregate: group_title → { count, samples (up to 5 names) }
      const agg: Record<string, { count: number; samples: string[] }> = {};
      for (const item of data || []) {
        const g = item.group_title || '';
        if (!agg[g]) agg[g] = { count: 0, samples: [] };
        agg[g].count++;
        if (agg[g].samples.length < 5) agg[g].samples.push(item.name);
      }

      const groups = Object.entries(agg)
        .map(([name, { count, samples }]) => ({ name, count, samples }))
        .sort((a, b) => b.count - a.count);

      return NextResponse.json({ groups, total: data?.length || 0 });
    }

    // ── Standard items query ──
    const contentType = url.searchParams.get('type');
    const search = url.searchParams.get('search');
    const group = url.searchParams.get('group');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('playlist_items')
      .select('*', { count: 'exact' })
      .eq('playlist_id', id);

    if (contentType && contentType !== 'all') {
      query = query.eq('content_type', contentType);
    }

    // Group filter
    if (group) {
      if (group === '__ungrouped__') {
        query = query.is('group_title', null);
      } else {
        query = query.eq('group_title', group);
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,group_title.ilike.%${search}%`);
    }

    query = query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      items: data,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

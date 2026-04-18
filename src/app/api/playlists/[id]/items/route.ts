import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
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
    const contentType = url.searchParams.get('type');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('playlist_items')
      .select('*', { count: 'exact' })
      .eq('playlist_id', id);

    if (contentType && contentType !== 'all') {
      query = query.eq('content_type', contentType);
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

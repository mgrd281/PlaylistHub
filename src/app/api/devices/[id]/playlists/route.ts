import { createClientFromRequest } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/devices/[id]/playlists — List playlists linked to device
 * POST /api/devices/[id]/playlists — Link a playlist to device
 * DELETE /api/devices/[id]/playlists — Unlink a playlist from device (body: { playlist_id })
 */

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

    // Verify device ownership
    const { data: device } = await supabase
      .from('devices')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const { data: links, error } = await supabase
      .from('playlist_device_links')
      .select('id, playlist_id, linked_at')
      .eq('device_id', id)
      .order('linked_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
    }

    // Fetch playlist details for linked playlists
    const playlistIds = (links || []).map((l: { playlist_id: string }) => l.playlist_id);

    let playlists: unknown[] = [];
    if (playlistIds.length > 0) {
      const { data } = await supabase
        .from('playlists')
        .select('id, name, status, total_items, type')
        .in('id', playlistIds);
      playlists = data || [];
    }

    return NextResponse.json({ links: links || [], playlists });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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

    const body = await request.json();
    const { playlist_id } = body;

    if (!playlist_id) {
      return NextResponse.json({ error: 'playlist_id is required' }, { status: 400 });
    }

    // Verify device ownership
    const { data: device } = await supabase
      .from('devices')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (device.status !== 'active') {
      return NextResponse.json({ error: 'Device is not active' }, { status: 403 });
    }

    // Verify playlist ownership
    const { data: playlist } = await supabase
      .from('playlists')
      .select('id')
      .eq('id', playlist_id)
      .eq('user_id', user.id)
      .single();

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    // Create link (upsert to handle duplicates)
    const { data: link, error: linkError } = await supabase
      .from('playlist_device_links')
      .upsert(
        { device_id: id, playlist_id },
        { onConflict: 'device_id,playlist_id' }
      )
      .select()
      .single();

    if (linkError) {
      return NextResponse.json({ error: 'Failed to link playlist' }, { status: 500 });
    }

    return NextResponse.json(link, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    const body = await request.json();
    const { playlist_id } = body;

    if (!playlist_id) {
      return NextResponse.json({ error: 'playlist_id is required' }, { status: 400 });
    }

    // Verify device ownership
    const { data: device } = await supabase
      .from('devices')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('playlist_device_links')
      .delete()
      .eq('device_id', id)
      .eq('playlist_id', playlist_id);

    if (error) {
      return NextResponse.json({ error: 'Failed to unlink playlist' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

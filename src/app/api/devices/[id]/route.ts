import { createClientFromRequest } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/devices/[id] — Get device details
 * PATCH /api/devices/[id] — Update device (rename, revoke)
 * DELETE /api/devices/[id] — Remove device permanently
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

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Also fetch linked playlists
    const { data: links } = await supabase
      .from('playlist_device_links')
      .select('playlist_id, linked_at, playlists(id, name, status, total_items)')
      .eq('device_id', id);

    // Fetch activation history
    const { data: activations } = await supabase
      .from('device_activations')
      .select('*')
      .eq('device_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      device,
      playlists: links || [],
      activations: activations || [],
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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
    const allowedFields: Record<string, unknown> = {};

    // Rename
    if (typeof body.device_label === 'string') {
      const label = body.device_label.trim();
      if (label.length === 0 || label.length > 100) {
        return NextResponse.json({ error: 'Label must be 1-100 characters' }, { status: 400 });
      }
      allowedFields.device_label = label;
    }

    // Revoke
    if (body.status === 'revoked') {
      allowedFields.status = 'revoked';
      allowedFields.revoked_at = new Date().toISOString();
    }

    // Reactivate (only if currently revoked)
    if (body.status === 'active') {
      // Verify device is currently revoked
      const { data: device } = await supabase
        .from('devices')
        .select('status')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (!device || device.status !== 'revoked') {
        return NextResponse.json({ error: 'Device can only be reactivated if revoked' }, { status: 400 });
      }
      allowedFields.status = 'active';
      allowedFields.revoked_at = null;
      allowedFields.activated_at = new Date().toISOString();
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('devices')
      .update(allowedFields)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: 'Device not found or update failed' }, { status: 404 });
    }

    return NextResponse.json(updated);
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

    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

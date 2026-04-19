import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, createServiceClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const svc = createServiceClient();

  // Profile
  const { data: profile, error: profErr } = await svc
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (profErr || !profile) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // Playlists
  const { data: playlists } = await svc
    .from('playlists')
    .select('id, name, type, status, total_items, channels_count, movies_count, series_count, last_scan_at, error_message, created_at, updated_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  // Devices
  const { data: devices } = await svc
    .from('devices')
    .select('id, device_label, platform, model, os_version, app_version, status, activated_at, last_seen_at, reinstall_count, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  // Recent device sessions (last 20)
  const deviceIds = (devices ?? []).map(d => d.id);
  let sessions: unknown[] = [];
  if (deviceIds.length > 0) {
    const { data } = await svc
      .from('device_sessions')
      .select('id, device_id, started_at, last_heartbeat_at, ip_address, app_version, ended_at')
      .in('device_id', deviceIds)
      .order('started_at', { ascending: false })
      .limit(20);
    sessions = data ?? [];
  }

  // Recent activations
  let activations: unknown[] = [];
  if (deviceIds.length > 0) {
    const { data } = await svc
      .from('device_activations')
      .select('id, device_id, activation_type, ip_address, user_agent, created_at')
      .in('device_id', deviceIds)
      .order('created_at', { ascending: false })
      .limit(20);
    activations = data ?? [];
  }

  return NextResponse.json({
    profile: { ...profile, role: profile.role ?? 'user' },
    playlists: playlists ?? [],
    devices: devices ?? [],
    sessions,
    activations,
  });
}

/** Admin action: update customer role */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const svc = createServiceClient();

  // Only allow role updates for now
  const updates: Record<string, unknown> = {};
  if (body.role && ['user', 'admin'].includes(body.role)) {
    updates.role = body.role;
  }
  if (body.display_name !== undefined) {
    updates.display_name = body.display_name;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await svc
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

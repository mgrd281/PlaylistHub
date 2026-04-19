import { NextResponse } from 'next/server';
import { requireAdmin, createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const svc = createServiceClient();

  // Fetch all profiles
  const { data: profiles, error: profErr } = await svc
    .from('profiles')
    .select('id, email, display_name, role, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const userIds = (profiles ?? []).map(p => p.id);
  if (userIds.length === 0) return NextResponse.json([]);

  // Aggregate playlists per user
  const { data: playlists } = await svc
    .from('playlists')
    .select('user_id, channels_count, movies_count, series_count');

  // Aggregate devices per user
  const { data: devices } = await svc
    .from('devices')
    .select('user_id, status, last_seen_at');

  // Aggregate last scan per user
  const { data: scans } = await svc
    .from('playlists')
    .select('user_id, last_scan_at')
    .not('last_scan_at', 'is', null);

  // Build lookup maps
  const playlistMap = new Map<string, { count: number; channels: number; movies: number; series: number }>();
  for (const p of playlists ?? []) {
    const prev = playlistMap.get(p.user_id) ?? { count: 0, channels: 0, movies: 0, series: 0 };
    playlistMap.set(p.user_id, {
      count: prev.count + 1,
      channels: prev.channels + (p.channels_count ?? 0),
      movies: prev.movies + (p.movies_count ?? 0),
      series: prev.series + (p.series_count ?? 0),
    });
  }

  const deviceMap = new Map<string, { total: number; active: number; lastSeen: string | null }>();
  for (const d of devices ?? []) {
    if (!d.user_id) continue;
    const prev = deviceMap.get(d.user_id) ?? { total: 0, active: 0, lastSeen: null };
    deviceMap.set(d.user_id, {
      total: prev.total + 1,
      active: prev.active + (d.status === 'active' ? 1 : 0),
      lastSeen: d.last_seen_at && (!prev.lastSeen || d.last_seen_at > prev.lastSeen)
        ? d.last_seen_at : prev.lastSeen,
    });
  }

  const scanMap = new Map<string, string>();
  for (const s of scans ?? []) {
    const prev = scanMap.get(s.user_id);
    if (s.last_scan_at && (!prev || s.last_scan_at > prev)) {
      scanMap.set(s.user_id, s.last_scan_at);
    }
  }

  const customers = (profiles ?? []).map(p => {
    const pl = playlistMap.get(p.id);
    const dv = deviceMap.get(p.id);
    const lastScan = scanMap.get(p.id) ?? null;
    const lastDevice = dv?.lastSeen ?? null;
    // Last activity = most recent of device heartbeat or playlist scan
    const lastActivity = [lastScan, lastDevice].filter(Boolean).sort().pop() ?? null;

    return {
      id: p.id,
      email: p.email,
      display_name: p.display_name,
      role: p.role ?? 'user',
      created_at: p.created_at,
      updated_at: p.updated_at,
      playlists_count: pl?.count ?? 0,
      devices_count: dv?.total ?? 0,
      active_devices_count: dv?.active ?? 0,
      total_channels: pl?.channels ?? 0,
      total_movies: pl?.movies ?? 0,
      total_series: pl?.series ?? 0,
      last_activity: lastActivity,
    };
  });

  return NextResponse.json(customers);
}

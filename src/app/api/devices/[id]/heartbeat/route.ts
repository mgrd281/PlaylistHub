import { createClientFromRequest } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/devices/[id]/heartbeat
 * Device sends a heartbeat to update last_seen_at and maintain session.
 * Body: { app_version? }
 */
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

    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    // Update device last_seen
    const { data: device, error: updateError } = await supabase
      .from('devices')
      .update({
        last_seen_at: now,
        ...(body.app_version ? { app_version: body.app_version } : {}),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .select('id, status, activated_at, last_seen_at')
      .single();

    if (updateError || !device) {
      return NextResponse.json({ error: 'Device not found or not active' }, { status: 404 });
    }

    // Upsert session — find active session or create new one
    const { data: existingSession } = await supabase
      .from('device_sessions')
      .select('id')
      .eq('device_id', id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession) {
      await supabase
        .from('device_sessions')
        .update({
          last_heartbeat_at: now,
          ip_address: ip,
          app_version: body.app_version || null,
        })
        .eq('id', existingSession.id);
    } else {
      await supabase
        .from('device_sessions')
        .insert({
          device_id: id,
          ip_address: ip,
          app_version: body.app_version || null,
        });
    }

    return NextResponse.json({
      status: device.status,
      last_seen_at: now,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

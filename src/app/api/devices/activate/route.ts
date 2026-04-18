import { createClientFromRequest } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/devices/activate
 * Activate a pending device using its activation code.
 * Called from the website by an authenticated user.
 * Body: { activation_code: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { activation_code } = body;

    if (!activation_code || typeof activation_code !== 'string') {
      return NextResponse.json({ error: 'Activation code is required' }, { status: 400 });
    }

    // Normalize code (uppercase, trim)
    const code = activation_code.trim().toUpperCase();

    // Find device by activation code
    const { data: device, error: findError } = await supabase
      .from('devices')
      .select('*')
      .eq('activation_code', code)
      .single();

    if (findError || !device) {
      return NextResponse.json({ error: 'Invalid activation code' }, { status: 404 });
    }

    // Check if already activated by another user
    if (device.status === 'active' && device.user_id && device.user_id !== user.id) {
      return NextResponse.json({ error: 'Device is already linked to another account' }, { status: 409 });
    }

    // Check if already active for this user
    if (device.status === 'active' && device.user_id === user.id) {
      return NextResponse.json({ message: 'Device is already active', device });
    }

    // Check if revoked
    if (device.status === 'revoked') {
      return NextResponse.json({ error: 'Device has been revoked. Contact support.' }, { status: 403 });
    }

    // Check if code expired (24 hours)
    const createdAt = new Date(device.created_at);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (device.status === 'pending' && createdAt < dayAgo) {
      // Mark as expired
      await supabase
        .from('devices')
        .update({ status: 'expired' })
        .eq('id', device.id);
      return NextResponse.json({ error: 'Activation code has expired' }, { status: 410 });
    }

    const now = new Date().toISOString();

    // Activate the device
    const { data: activated, error: updateError } = await supabase
      .from('devices')
      .update({
        user_id: user.id,
        status: 'active',
        activated_at: now,
        last_seen_at: now,
      })
      .eq('id', device.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to activate device' }, { status: 500 });
    }

    // Log activation
    await supabase.from('device_activations').insert({
      device_id: device.id,
      user_id: user.id,
      activation_type: 'code',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: 'Device activated successfully', device: activated });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

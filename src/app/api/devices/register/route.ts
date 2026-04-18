import { createClientFromRequest } from '@/lib/supabase/server';
import { generateDeviceKey, generateActivationCode, MAX_DEVICES_PER_USER } from '@/lib/devices';
import { NextResponse } from 'next/server';

/**
 * POST /api/devices/register
 * Register a new device for the authenticated user.
 * Body: { platform, model?, os_version?, app_version?, fingerprint_hash?, device_label? }
 * Returns: device record with device_key and activation_code
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      platform = 'ios',
      model,
      os_version,
      app_version,
      fingerprint_hash,
      device_label,
    } = body;

    // Validate platform
    const validPlatforms = ['ios', 'tvos', 'android', 'web', 'other'];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    // Check if device with same fingerprint already exists (reinstall detection)
    if (fingerprint_hash) {
      const { data: existing } = await supabase
        .from('devices')
        .select('*')
        .eq('user_id', user.id)
        .eq('fingerprint_hash', fingerprint_hash)
        .in('status', ['active', 'pending'])
        .limit(1)
        .single();

      if (existing) {
        // Reactivate existing device
        const { data: updated, error: updateError } = await supabase
          .from('devices')
          .update({
            status: 'active',
            last_seen_at: new Date().toISOString(),
            app_version,
            os_version,
            reinstall_count: existing.reinstall_count + 1,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          return NextResponse.json({ error: 'Failed to reactivate device' }, { status: 500 });
        }

        // Log reactivation
        await supabase.from('device_activations').insert({
          device_id: existing.id,
          user_id: user.id,
          activation_type: 'reactivation',
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          user_agent: request.headers.get('user-agent'),
        });

        return NextResponse.json(updated);
      }
    }

    // Enforce max devices
    const { count } = await supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['active', 'pending']);

    if ((count || 0) >= MAX_DEVICES_PER_USER) {
      return NextResponse.json(
        { error: `Maximum ${MAX_DEVICES_PER_USER} devices allowed. Revoke an existing device first.` },
        { status: 429 }
      );
    }

    // Generate credentials
    const deviceKey = generateDeviceKey();
    const activationCode = generateActivationCode();

    // Create device record
    const { data: device, error: insertError } = await supabase
      .from('devices')
      .insert({
        user_id: user.id,
        device_key: deviceKey,
        activation_code: activationCode,
        device_label: device_label || model || `${platform} device`,
        platform,
        model,
        os_version,
        app_version,
        fingerprint_hash,
        status: 'active', // Auto-active because user is authenticated
        activated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Device registration error:', insertError);
      return NextResponse.json({ error: 'Failed to register device' }, { status: 500 });
    }

    // Log activation
    await supabase.from('device_activations').insert({
      device_id: device.id,
      user_id: user.id,
      activation_type: 'auto',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json(device, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

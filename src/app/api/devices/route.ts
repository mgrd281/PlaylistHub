import { createClient, createClientFromRequest } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/devices
 * List all devices for the authenticated user.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
    }

    return NextResponse.json({ devices: devices || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

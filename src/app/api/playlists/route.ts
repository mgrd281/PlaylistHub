import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure profile exists (handles users created before schema)
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email!,
      display_name: user.email!.split('@')[0],
    }, { onConflict: 'id' });

    const body = await request.json();
    const { name, source_url } = body;

    if (!name || !source_url) {
      return NextResponse.json({ error: 'Name and source URL are required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(source_url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Detect type from URL
    let type = 'M3U';
    if (source_url.endsWith('.m3u8')) {
      type = 'M3U8';
    }

    const { data, error } = await supabase
      .from('playlists')
      .insert({
        user_id: user.id,
        name,
        source_url,
        type,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

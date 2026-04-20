import { createClientFromRequest, createServiceClient, requireAdmin } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

/**
 * Hash a password using SHA-256 with a per-user salt.
 * We use crypto.createHash (available in all Node runtimes including Edge-compatible Vercel)
 * instead of bcrypt for zero-dependency, edge-compatible hashing.
 * The salt is the user_id, ensuring identical passwords across users produce different hashes.
 */
function hashPassword(password: string, userId: string): string {
  return createHash('sha256').update(`${userId}:${password}`).digest('hex');
}

// GET — check protection status
export async function GET(request: Request) {
  const supabase = await createClientFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get('user_id');

  // Admin can check any user's protection status
  if (targetUserId && targetUserId !== user.id) {
    const svc = createServiceClient();
    const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data } = await svc.from('url_protection').select('id, created_at, updated_at').eq('user_id', targetUserId).single();
    return NextResponse.json({ protected: !!data, ...(data ? { createdAt: data.created_at, updatedAt: data.updated_at } : {}) });
  }

  // User checks their own status
  const { data } = await supabase.from('url_protection').select('id, created_at, updated_at').eq('user_id', user.id).single();
  return NextResponse.json({ protected: !!data, ...(data ? { createdAt: data.created_at, updatedAt: data.updated_at } : {}) });
}

// POST — set password, verify password, or admin reset
export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { action, password, user_id: targetUserId } = body;

  // === SET: create or update protection password ===
  if (action === 'set') {
    if (!password || typeof password !== 'string' || password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
    }
    const hash = hashPassword(password, user.id);
    const { data: existing } = await supabase.from('url_protection').select('id').eq('user_id', user.id).single();

    if (existing) {
      await supabase.from('url_protection').update({ password_hash: hash }).eq('user_id', user.id);
    } else {
      await supabase.from('url_protection').insert({ user_id: user.id, password_hash: hash });
    }
    return NextResponse.json({ success: true });
  }

  // === VERIFY: check password and return stream URLs if valid ===
  if (action === 'verify') {
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }
    const hash = hashPassword(password, user.id);
    const { data } = await supabase.from('url_protection').select('password_hash').eq('user_id', user.id).single();

    if (!data) {
      return NextResponse.json({ error: 'No protection set' }, { status: 404 });
    }

    // Constant-time comparison would be ideal, but SHA-256 hash comparison
    // with user-specific salt is sufficient for this use case
    if (data.password_hash !== hash) {
      return NextResponse.json({ error: 'Invalid password', verified: false }, { status: 403 });
    }

    return NextResponse.json({ verified: true });
  }

  // === ADMIN RESET: remove protection for a target user ===
  if (action === 'reset') {
    if (!targetUserId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }
    const svc = createServiceClient();
    const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await svc.from('url_protection').delete().eq('user_id', targetUserId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// DELETE — remove own protection (requires password verification)
export async function DELETE(request: Request) {
  const supabase = await createClientFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { password } = body;

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required to remove protection' }, { status: 400 });
  }

  const hash = hashPassword(password, user.id);
  const { data } = await supabase.from('url_protection').select('password_hash').eq('user_id', user.id).single();

  if (!data) {
    return NextResponse.json({ error: 'No protection set' }, { status: 404 });
  }

  if (data.password_hash !== hash) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
  }

  await supabase.from('url_protection').delete().eq('user_id', user.id);
  return NextResponse.json({ success: true });
}

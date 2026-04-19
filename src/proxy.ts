import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // Skip cookie-based auth for API routes with Bearer token (iOS native app).
  // The route handler verifies the token itself.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!api/stream|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

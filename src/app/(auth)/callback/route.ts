import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

import { getSafeRedirectUrl } from '@/lib/auth/safe-redirect';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[AuthCallback] Failed to exchange code for session:', error.message);
      return NextResponse.redirect(new URL('/login?error=auth_callback_failed', requestUrl.origin));
    }
  }

  const safePath = getSafeRedirectUrl(next, '/');
  return NextResponse.redirect(new URL(safePath, requestUrl.origin));
}


import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function getSafeRedirectUrl(target: string | null, origin: string): URL {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return new URL('/', origin);
  }
  try {
    const candidate = new URL(target, origin);
    if (candidate.origin !== origin) {
      return new URL('/', origin);
    }
    return candidate;
  } catch {
    return new URL('/', origin);
  }
}

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

  const safeRedirect = getSafeRedirectUrl(next, requestUrl.origin);
  return NextResponse.redirect(safeRedirect);
}


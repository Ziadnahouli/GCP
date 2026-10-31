import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next(
    typeof Headers !== 'undefined' && request.headers instanceof Headers
      ? { request: { headers: request.headers } }
      : undefined
  );

  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    // If Supabase is not configured yet, let user proceed to test local/demo UI
    return { response, user: null };
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value,
          ...options,
        });
        response = NextResponse.next(
          typeof Headers !== 'undefined' && request.headers instanceof Headers
            ? { request: { headers: request.headers } }
            : undefined
        );
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value: '',
          ...options,
        });
        response = NextResponse.next(
          typeof Headers !== 'undefined' && request.headers instanceof Headers
            ? { request: { headers: request.headers } }
            : undefined
        );
        response.cookies.set({
          name,
          value: '',
          ...options,
        });
      },
    },
  });

  // S3: Local session verification first (avoids network call to Supabase Auth on every request)
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  let user = null;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (session?.user && session.expires_at && session.expires_at > nowSeconds + 60) {
    // Session is valid and far from expiry: zero network overhead
    user = session.user;
  } else if (session) {
    // Near expiry or expired: refresh session via getUser()
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  }

  return { response, user };
}

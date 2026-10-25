import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getSupabaseConfig } from '@/lib/supabase/config';

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  const config = getSupabaseConfig();
  // In unconfigured / local demo mode, allow browsing
  if (!config.isConfigured) {
    return response;
  }

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';

  const isPublicRoute =
    pathname.startsWith('/api/desktop-telemetry') ||
    pathname.startsWith('/callback') ||
    pathname.startsWith('/invite/');

  // Unauthenticated user requesting protected main app route
  if (!user && !isAuthRoute && !isPublicRoute && !pathname.startsWith('/api/')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    // Preserve full path AND search parameters (e.g. /?join=... or deep protected routes)
    const target = request.nextUrl.pathname + request.nextUrl.search;
    if (target !== '/' && target !== '') {
      redirectUrl.searchParams.set('redirectTo', target);
    }
    // Copy any refreshed cookies from response to redirectResponse
    const redirectResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  // Signed-in user requesting auth pages (/login, /register) -> redirect to home
  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    const redirectResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - worklets (audio worklet processors)
     * - static extensions (svg, png, jpg, jpeg, gif, webp, wasm, mp3, wav, ogg)
     */
    '/((?!_next/static|_next/image|favicon.ico|worklets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|mp3|wav|ogg)$).*)',
  ],
};

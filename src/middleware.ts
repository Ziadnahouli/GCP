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

  const isPublicApi =
    pathname.startsWith('/api/desktop-telemetry') ||
    pathname.startsWith('/callback');

  // Unauthenticated user requesting protected main app route
  if (!user && !isAuthRoute && !isPublicApi && !pathname.startsWith('/api/')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    if (pathname !== '/') {
      redirectUrl.searchParams.set('redirectTo', pathname);
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
     * - favicon.ico, sitemap.xml, robots.txt
     * - worklets (audio worklet processor scripts in /public/worklets)
     * - callback (auth exchange callback)
     * - api/desktop-telemetry
     * - static asset extensions (.svg, .png, .jpg, .wasm, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|callback|worklets|api/desktop-telemetry|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|ico|css|js)$).*)',
  ],
};

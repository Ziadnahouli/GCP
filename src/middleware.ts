import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];
const PUBLIC_PREFIXES = ['/callback', '/api/link-preview', '/worklets', '/_next'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Run Supabase session token refresh
  const { response, user } = await updateSession(request);

  // If path is a public prefix or static asset, pass through
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return response;
  }

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // If unauthenticated and trying to access main app routes (non-auth route), redirect to /login
  if (!user && !isAuthRoute && pathname !== '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    const redirectRes = NextResponse.redirect(redirectUrl);
    // Copy cookies so any refreshed/cleared tokens persist
    response.cookies.getAll().forEach((cookie) => {
      redirectRes.cookies.set(cookie);
    });
    return redirectRes;
  }

  // If authenticated and trying to access /login, /register, etc., redirect to main app /
  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    const redirectRes = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectRes.cookies.set(cookie);
    });
    return redirectRes;
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
     * - static extensions (svg, png, jpg, jpeg, gif, webp, wasm, mp3, wav)
     */
    '/((?!_next/static|_next/image|favicon.ico|worklets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|mp3|wav|ogg)$).*)',
  ],
};

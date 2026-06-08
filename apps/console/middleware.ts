import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes — no auth required
const PUBLIC_PREFIXES = ['/docs', '/_next', '/api', '/favicon'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * SSO: Console does NOT have its own login page.
 * Unauthenticated users are redirected to the main app's login
 * with a returnTo param so they come back after signing in.
 */
function getAppLoginUrl(request: NextRequest, returnPath: string): URL {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const loginUrl = new URL('/login', appUrl);
  // Build the full Console URL for returnTo
  const consoleOrigin = request.nextUrl.origin;
  loginUrl.searchParams.set('returnTo', `${consoleOrigin}${returnPath}`);
  return loginUrl;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // SSO token relay: main app redirects here with ?sso=1 and #token=...&user=... in the hash.
  // Hash fragments aren't sent to the server, so we can't read the token here.
  // Let the request through — client-side AuthProvider will consume the hash and set auth state.
  if (searchParams.get('sso') === '1') {
    return NextResponse.next();
  }

  // All non-public routes require auth — check app-auth cookie
  const authCookie = request.cookies.get('app-auth');
  if (!authCookie?.value) {
    return NextResponse.redirect(getAppLoginUrl(request, pathname));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication.
//
// Keep in sync with protectedRoutePatterns in src/shared/lib/navigation.ts.
// When adding a new protected route, update BOTH files.
//
// Note: this list is intentionally a superset of protectedRoutePatterns in
// navigation.ts — /onboarding and /super-admin are protected here but not
// surfaced in the nav config because they are not sidebar destinations.
const PROTECTED_PREFIXES = [
  '/dispatcher',
  '/driver',
  '/admin',
  '/customer',
  '/settings',
  '/onboarding',
  '/setup-hub',
  '/notifications',
  '/super-admin',
];

// Routes that are always public
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/track',
  '/pricing',
  '/product',
  '/accept-invitation',
  '/sally-canvas',
  '/sally-nerve',
  '/sally-default',
  '/rest-optimizer',
  '/_next',
  '/api',
  '/favicon',
];

// ─── Maintenance Mode ───
// Only protected (app) routes show maintenance page — marketing/public pages stay up.
const MAINTENANCE_BYPASS = ['/maintenance', '/api/maintenance-status'];

const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL || '';

// Best-effort in-memory cache — on Vercel, each serverless/edge isolate has
// independent memory and may be evicted at any time. The real cache layer
// is CloudFront's 30s TTL. This just avoids redundant fetches within a
// single warm isolate.
let maintenanceCache: { enabled: boolean; checkedAt: number } = {
  enabled: false,
  checkedAt: 0,
};
const CACHE_TTL_MS = 30_000;

async function isMaintenanceMode(): Promise<boolean> {
  if (!CDN_URL) return false;

  const now = Date.now();
  if (now - maintenanceCache.checkedAt < CACHE_TTL_MS) {
    return maintenanceCache.enabled;
  }

  try {
    const res = await fetch(`${CDN_URL}/status/maintenance.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000), // 3s timeout — don't block requests
    });

    if (!res.ok) {
      maintenanceCache = { enabled: false, checkedAt: now };
      return false;
    }

    const data = await res.json();
    const enabled = data?.enabled === true;
    maintenanceCache = { enabled, checkedAt: now };
    return enabled;
  } catch {
    // On fetch failure, use cached value (don't block users if CDN is unreachable)
    maintenanceCache = { ...maintenanceCache, checkedAt: now };
    return maintenanceCache.enabled;
  }
}

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost:3000';

/**
 * Route-level role guard (UX convenience layer, NOT a security boundary).
 *
 * The app-role cookie is set client-side and is therefore spoofable.
 * The real RBAC enforcement happens at the backend via JWT-embedded roles
 * and @Roles() decorators on each controller/endpoint. This middleware
 * guard exists solely to redirect wrong-role users to their default route
 * instead of showing a broken page with 403 API errors.
 */
// Role constants — duplicated from @app/shared-types because middleware
// runs on Edge Runtime where workspace package imports are unreliable.
const ROLES = {
  DISPATCHER: 'DISPATCHER',
  DRIVER: 'DRIVER',
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
  CUSTOMER: 'CUSTOMER',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

const FLEET_MGMT_ROLES = [ROLES.DISPATCHER, ROLES.ADMIN, ROLES.OWNER];

const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/dispatcher': FLEET_MGMT_ROLES,
  '/driver': [ROLES.DRIVER],
  '/customer': [ROLES.CUSTOMER],
  '/super-admin': [ROLES.SUPER_ADMIN],
  '/admin': [ROLES.SUPER_ADMIN],
  // /settings, /onboarding, /setup-hub, /notifications — accessible to all authenticated roles
};

const ROLE_DEFAULT_ROUTES: Record<string, string> = {
  [ROLES.DISPATCHER]: '/dispatcher',
  [ROLES.ADMIN]: '/dispatcher',
  [ROLES.OWNER]: '/dispatcher',
  [ROLES.DRIVER]: '/driver/home',
  [ROLES.CUSTOMER]: '/customer/dashboard',
  [ROLES.SUPER_ADMIN]: '/admin/tenants',
};

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname === '/';
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Check if a role is allowed to access a given pathname.
 * Returns the default redirect path if denied, or null if allowed.
 */
function getRoleRedirect(pathname: string, role: string | undefined): string | null {
  if (!role) return null; // No role cookie — skip enforcement (auth guard handles it)

  for (const [prefix, allowedRoles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname.startsWith(prefix)) {
      if (!allowedRoles.includes(role)) {
        return ROLE_DEFAULT_ROUTES[role] || '/login';
      }
      return null; // Allowed
    }
  }

  return null; // No role restriction for this route prefix
}

/**
 * Extract tenant subdomain slug from hostname.
 *
 * Duplicated from shared/lib/tenant-url.ts because middleware runs on Edge
 * runtime and we want zero external dependencies here.
 *
 * "acme.staging.sally.appshore.in" → "acme"
 * "staging.sally.appshore.in"      → null
 * "localhost:3000"                  → null
 */
/** Valid DNS label: lowercase alphanumeric + hyphens, 1-63 chars. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function extractSubdomain(hostname: string): string | null {
  const baseDomain = APP_DOMAIN.split(':')[0];
  if (baseDomain === 'localhost') return null;

  const host = hostname.split(':')[0];
  if (!host.endsWith(`.${baseDomain}`)) return null;

  const slug = host.slice(0, -(baseDomain.length + 1));
  if (!slug || slug.includes('.')) return null;
  if (!SLUG_RE.test(slug)) return null;

  return slug;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // ─── Maintenance Mode Check (protected routes only) ───
  // Marketing/public pages stay up — only app routes behind login show maintenance.
  const bypassMaintenance = MAINTENANCE_BYPASS.some((p) => pathname.startsWith(p));

  if (!bypassMaintenance && isProtectedRoute(pathname)) {
    const maintenance = await isMaintenanceMode();
    if (maintenance) {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  }

  // If user is on /maintenance but maintenance is OFF, redirect to home
  if (pathname.startsWith('/maintenance')) {
    const maintenance = await isMaintenanceMode();
    if (!maintenance) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Extract tenant subdomain (null on bare domain or localhost)
  const tenantSlug = extractSubdomain(hostname);

  // Set x-tenant-slug header so Server Components can read the tenant via headers().
  // Currently scaffolding for Phase 2 (tenant branding on login page, etc.).
  if (isPublicRoute(pathname)) {
    if (tenantSlug) {
      const response = NextResponse.next();
      response.headers.set('x-tenant-slug', tenantSlug);
      return response;
    }
    return NextResponse.next();
  }

  // Only enforce auth on explicitly protected routes
  if (isProtectedRoute(pathname)) {
    const authCookie = request.cookies.get('app-auth');

    if (!authCookie?.value) {
      // If on a subdomain, redirect to main domain login preserving the return URL
      if (tenantSlug) {
        const protocol = request.nextUrl.protocol; // "https:" or "http:"
        const loginUrl = new URL(`${protocol}//${APP_DOMAIN}/login`);
        loginUrl.searchParams.set('redirect', pathname);
        // Slug is NOT passed as a query param — after login, the redirect uses
        // the authenticated user's subdomain from the backend response, not a
        // client-supplied value (prevents open redirect via crafted slug).
        return NextResponse.redirect(loginUrl);
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Role-based route enforcement — redirect wrong-role users to their default route
    const roleCookie = request.cookies.get('app-role');
    const roleRedirect = getRoleRedirect(pathname, roleCookie?.value);
    if (roleRedirect) {
      return NextResponse.redirect(new URL(roleRedirect, request.url));
    }

    // Authenticated — pass tenant header through
    if (tenantSlug) {
      const response = NextResponse.next();
      response.headers.set('x-tenant-slug', tenantSlug);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

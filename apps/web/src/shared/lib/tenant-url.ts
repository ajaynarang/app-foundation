/**
 * Tenant subdomain URL utilities.
 *
 * NEXT_PUBLIC_APP_DOMAIN is the bare domain (no protocol, no subdomain):
 *   - staging.app.appshore.in  (staging)
 *   - app.appshore.in          (production)
 *   - localhost:3000              (local dev)
 */

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost:3000';

/** Valid DNS label: lowercase alphanumeric + hyphens, 1-63 chars, no leading/trailing hyphen. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Check if we're running on localhost (subdomains don't work locally without
 * extra DNS setup like lvh.me or /etc/hosts entries).
 */
export function isLocalhost(): boolean {
  return APP_DOMAIN.startsWith('localhost');
}

/**
 * Validate that a string is a safe subdomain slug (valid DNS label).
 */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/**
 * Extract the tenant subdomain slug from a hostname.
 *
 * Returns null if the hostname is the bare domain, localhost, or the
 * extracted slug fails DNS label validation.
 *
 * Examples:
 *   "acme.staging.app.appshore.in" → "acme"
 *   "staging.app.appshore.in"      → null  (bare domain)
 *   "localhost:3000"                  → null  (local dev)
 */
export function extractSubdomain(hostname: string): string | null {
  const host = hostname.split(':')[0];
  const baseDomain = APP_DOMAIN.split(':')[0];

  if (baseDomain === 'localhost') return null;
  if (!host.endsWith(`.${baseDomain}`)) return null;

  const slug = host.slice(0, -(baseDomain.length + 1));
  if (!slug || slug.includes('.')) return null;
  if (!SLUG_RE.test(slug)) return null;

  return slug;
}

/**
 * Build the full URL for a tenant subdomain.
 *
 * On localhost, returns the path as-is (no subdomain redirect).
 * In deployed environments, returns `https://{slug}.{baseDomain}{path}`.
 * Returns the plain path if the slug is invalid (defensive).
 */
export function buildTenantUrl(subdomain: string, path: string = '/'): string {
  if (isLocalhost()) return path;
  if (!SLUG_RE.test(subdomain)) return path;
  return `https://${subdomain}.${APP_DOMAIN}${path}`;
}

/**
 * Build a cross-subdomain redirect URL that relays auth state in the hash.
 *
 * localStorage is origin-scoped, so when redirecting from the bare domain
 * (staging.app.appshore.in) to a tenant subdomain (acme.staging.app.appshore.in),
 * the Zustand auth store is empty on the target origin. This helper appends the
 * token + user as a `#sso-relay=...` hash fragment so the target page can hydrate.
 *
 * Returns null if no cross-domain redirect is needed (localhost, same origin, invalid slug).
 */
export function buildTenantRedirectUrl(
  subdomain: string,
  path: string,
  accessToken: string,
  user: object,
): string | null {
  const tenantUrl = buildTenantUrl(subdomain, path);
  // No redirect needed (localhost, invalid slug, or same URL)
  if (tenantUrl === path) return null;

  const payload = encodeURIComponent(JSON.stringify({ accessToken, user }));
  return `${tenantUrl}#sso-relay=${payload}`;
}

/**
 * Get the cookie domain for cross-subdomain auth.
 *
 * Returns `.staging.app.appshore.in` so the cookie is readable by
 * both the bare domain and all tenant subdomains.
 *
 * Returns undefined on localhost (browser default scope).
 */
export function getCookieDomain(): string | undefined {
  if (isLocalhost()) return undefined;
  return `.${APP_DOMAIN}`;
}

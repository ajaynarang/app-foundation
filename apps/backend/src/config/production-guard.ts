/**
 * Pure helpers for the production boot guard in `configuration.ts`.
 */

/**
 * True when this process is a production deployment: `NODE_ENV=production` (which the shipped image sets) or
 * `ENV_TYPE=production` (the deployment label, required at boot). Either one is enough, so a deploy that
 * forgets one of them still gets the boot guard, a Secure cookie, no Swagger UI and the load-balancer hop
 * trusted. A sandbox that runs with NODE_ENV=production is held to the same rules.
 */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const is = (value: string | undefined) => value?.trim().toLowerCase() === 'production';
  return is(env.NODE_ENV) || is(env.ENV_TYPE);
}

/** Values that are documentation, not secrets: `.env.example` text and common stand-ins. */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /change[-_ ]?me/i,
  /change[-_ ]in[-_ ](production|prod|dev)/i,
  /do[-_ ]not[-_ ]use/i,
  /^your[-_ ]/i,
  /placeholder/i,
  /example/i,
  /random-32-char-string/i,
  /minimum-32-chars/i,
  /\.\.\.$/,
  /^<.*>$/,
  /^(x+|0+|secret|password|todo|tbd|none|null|undefined)$/i,
];

/** True when a secret's value is a known stand-in rather than a generated secret. */
export function isPlaceholderSecret(value: string): boolean {
  const trimmed = value.trim();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const LOOPBACK_HOST = /^(localhost|.*\.localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)$/i;

/**
 * The entries of a comma-separated CORS_ORIGINS value that point at this
 * machine. CORS here is credentialed, so such an origin lets any page served
 * from a developer machine (or a local process) call the API with the user's
 * cookies.
 */
export function findLocalCorsOrigins(corsOrigins: string): string[] {
  return corsOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter(isLocalOrigin);
}

/** True when a URL (or bare host[:port]) points at this machine. */
export function isLocalOrigin(origin: string): boolean {
  return LOOPBACK_HOST.test(hostOf(origin));
}

function hostOf(origin: string): string {
  try {
    const { hostname } = new URL(origin);
    if (hostname) return hostname;
  } catch {
    // fall through
  }
  // Not a full URL (e.g. "localhost:3000"): strip a scheme and a port by hand.
  return origin.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[:/].*$/, '');
}

/** Mirrors how the Inngest SDK reads INNGEST_DEV: "1", "true" or a dev-server URL turn dev mode on. */
export function isInngestDevMode(value: string | undefined): boolean {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed !== '' && !['0', 'false', 'undefined'].includes(trimmed);
}

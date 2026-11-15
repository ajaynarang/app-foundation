/**
 * The reasons code may run as declared cross-tenant work (`systemScope`, `forEachTenant`, `@SystemScope`). Adding a
 * reason is a reviewed change: once row-level security is enforced, each one is a standing hole in it. The
 * foundation's reasons are listed here; an app adds its own once, at module load, with `registerSystemReasons`.
 */
export const FOUNDATION_SYSTEM_REASONS = [
  // A super-admin route that reads across tenants (`@SystemScope('super-admin')`).
  'super-admin',
  // The outbox relay claims unpublished rows of every tenant; each event is then published as its own tenant.
  'outbox-relay',
  // The deadline sweeper claims due rows of every tenant; each handler then runs as its row's tenant.
  'deadline-sweep',
  // Foundation sweeps and per-tenant crons.
  'sweep.job-cleanup',
  'sweep.data-retention',
  'sweep.login-events-cleanup',
  'sweep.tokens-cleanup',
  'sweep.notification-cleanup',
  'sweep.whatsapp-stale',
  'cron.trial-expiry',
] as const;

export type FoundationSystemReason = (typeof FOUNDATION_SYSTEM_REASONS)[number];

/**
 * A foundation reason, or one an app registered. Typed as any string for app reasons; strict mode (tests and CI)
 * rejects an unregistered one at run time.
 */
export type SystemReason = FoundationSystemReason | (string & {});

const appReasons = new Set<string>();

/** Register an app's own reasons. Call once from the module that owns the work (idempotent). */
export function registerSystemReasons(reasons: readonly string[]): void {
  for (const reason of reasons) appReasons.add(reason);
}

export function isSystemReason(value: string): value is SystemReason {
  return (FOUNDATION_SYSTEM_REASONS as readonly string[]).includes(value) || appReasons.has(value);
}

/** Every listed reason: the foundation's, then the app's. */
export function listSystemReasons(): readonly string[] {
  return [...FOUNDATION_SYSTEM_REASONS, ...appReasons];
}

/**
 * Reasons that may be entered from inside a tenant or public scope, because the request itself legitimately touches
 * shared rows. Any other reason entered there is a privilege escalation: strict mode throws. Empty in the foundation;
 * keep it tiny.
 */
export const SYSTEM_REASONS_ALLOWED_IN_TENANT_SCOPE: readonly string[] = [];

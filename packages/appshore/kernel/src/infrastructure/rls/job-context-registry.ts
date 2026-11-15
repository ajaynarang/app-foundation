import { BULK_OPS_JOB_NAMES, NOTIFICATIONS_JOB_NAMES, WEBHOOKS_JOB_NAMES } from '../queue/queue.constants';
import type { SystemReason } from './system-reasons';

/**
 * How every BullMQ job name gets its tenant context (design item 20). `apps/backend/src/architecture/
 * rls-job-context-coverage.spec.ts` fails `pnpm test` when a handled job name has no entry, so a new job declares one:
 *
 * - `tenant`: the payload names the tenant (the envelope's numeric `tenantDbId`, or a numeric `tenantId`);
 *   `withJobContext` runs the whole job as it.
 * - `forEachTenant`: a cron that lists rows across tenants under the reason, then handles each one as its tenant
 *   (`forEachTenant(reason, …)`, or `systemScope(reason, …)` with a `runAsTenant` per row).
 * - `system`: a global sweep that runs entirely in `systemScope(reason)`.
 * - `noDatabase`: the job never reads or writes a tenant table (a log-only heartbeat), so it needs no context.
 *
 * The foundation's job names are declared here; an app declares its own in
 * `apps/backend/src/platform-glue/queue/job-context.ts`, merged with these by `mergeJobContext`.
 */
export type JobContextDecl =
  | { tenant: true; forEachTenant?: SystemReason }
  | { forEachTenant: SystemReason }
  | { system: SystemReason }
  | { noDatabase: true };

/** Wildcard key for the durable event bus, whose job names are the event names. */
export const ANY_EVENTS_JOB = 'events:*';

/**
 * The WhatsApp channel's job names. They are declared by `@appshore/platform` (the channel lives there), which kernel
 * cannot import; the coverage spec resolves the platform constants and fails if these drift.
 */
const WHATSAPP_SEND = 'whatsapp-send';
const WHATSAPP_STALE_SWEEP = 'whatsapp-stale-sweep';

export const FOUNDATION_JOB_CONTEXT: Readonly<Record<string, JobContextDecl>> = {
  // events: every durable event carries its tenant
  [ANY_EVENTS_JOB]: { tenant: true },

  // notifications
  [NOTIFICATIONS_JOB_NAMES.CLEANUP]: { system: 'sweep.notification-cleanup' },
  // A placeholder until a product writes its digest; it touches no table today.
  [NOTIFICATIONS_JOB_NAMES.DIGEST]: { noDatabase: true },

  // webhooks: one delivery to one tenant's subscription
  [WEBHOOKS_JOB_NAMES.DELIVER]: { tenant: true },

  // whatsapp
  [WHATSAPP_SEND]: { tenant: true },
  [WHATSAPP_STALE_SWEEP]: { system: 'sweep.whatsapp-stale' },

  // bulk-ops
  [BULK_OPS_JOB_NAMES.JOB_CLEANUP]: { system: 'sweep.job-cleanup' },
  [BULK_OPS_JOB_NAMES.DATA_RETENTION]: { system: 'sweep.data-retention' },
  [BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP]: { system: 'sweep.login-events-cleanup' },
  [BULK_OPS_JOB_NAMES.TOKENS_CLEANUP]: { system: 'sweep.tokens-cleanup' },
  [BULK_OPS_JOB_NAMES.TRIAL_EXPIRY]: { forEachTenant: 'cron.trial-expiry' },
  // The relay and the sweeper claim rows of every tenant, then run each one as its own tenant (item 19).
  [BULK_OPS_JOB_NAMES.OUTBOX_RELAY]: { system: 'outbox-relay' },
  [BULK_OPS_JOB_NAMES.DEADLINE_SWEEP]: { system: 'deadline-sweep' },
  // log-only liveness beat for worker-heartbeat-missing
  [BULK_OPS_JOB_NAMES.OPS_HEARTBEAT]: { noDatabase: true },
};

/** The foundation's declarations plus the app's. A job name declared twice fails at load. */
export function mergeJobContext(
  app: Readonly<Record<string, JobContextDecl>>,
  foundation: Readonly<Record<string, JobContextDecl>> = FOUNDATION_JOB_CONTEXT,
): Readonly<Record<string, JobContextDecl>> {
  for (const name of Object.keys(app)) {
    if (Object.prototype.hasOwnProperty.call(foundation, name)) {
      throw new Error(`Job context: "${name}" is declared by the foundation and again by the app.`);
    }
  }
  return { ...foundation, ...app };
}

/** The system reason a job runs under, if any (for dashboards and the coverage spec). */
export function jobSystemReason(decl: JobContextDecl): SystemReason | undefined {
  if ('system' in decl) return decl.system;
  if ('noDatabase' in decl) return undefined;
  return decl.forEachTenant;
}

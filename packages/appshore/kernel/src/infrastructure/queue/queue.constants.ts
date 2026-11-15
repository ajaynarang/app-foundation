/**
 * Queue topology — the foundation's own queues and job names.
 *
 * Queues are grouped by failure-domain tier. This list is the kernel's and is
 * pinned by `apps/backend/src/architecture/foundation-vocabulary.spec.ts`: an app
 * never adds a queue or a job name here. App queues and job names go in
 * `apps/backend/src/platform-glue/queue/job-names.ts` (`APP_QUEUE_NAMES`,
 * `APP_JOB_NAMES`), merged with these by `buildJobVocabulary` (job-vocabulary.ts).
 *
 * Tier 1 — Real-time (humans waiting)
 *  events         : durable event bus, fan-out spine
 *  notifications  : outbound SMS/push/email/in-app (priority enforced)
 *  webhooks       : outbound webhooks to customer systems
 *
 * Tier 2 — AI
 *  ai-interactive : user-blocking AI (chat, copilot)
 *  ai-background  : autonomous / background AI work
 *
 * Tier 3 — Slow lane (eventual is fine)
 *  bulk-ops       : mass operations + system crons (job-cleanup, data-retention,
 *                   login-events-cleanup, tokens-cleanup, trial-expiry), the
 *                   outbox relay, the deadline sweeper and the ops heartbeat
 */
export const QUEUE_NAMES = {
  EVENTS: 'events',
  NOTIFICATIONS: 'notifications',
  WEBHOOKS: 'webhooks',
  AI_INTERACTIVE: 'ai-interactive',
  AI_BACKGROUND: 'ai-background',
  BULK_OPS: 'bulk-ops',
  /** One vendor round trip per job, rate-limited under the BSP's ceiling. */
  WHATSAPP: 'whatsapp',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job names within the EVENTS queue — dynamic event names; no fixed list */
export const EVENTS_JOB_NAMES = {} as const;

/** Job names within the NOTIFICATIONS queue */
export const NOTIFICATIONS_JOB_NAMES = {
  CLEANUP: 'cleanup',
  DIGEST: 'digest',
} as const;

/** Job names within the WEBHOOKS queue */
export const WEBHOOKS_JOB_NAMES = {
  DELIVER: 'deliver',
} as const;

/** Job names within the AI_INTERACTIVE queue */
export const AI_INTERACTIVE_JOB_NAMES = {} as const;

/** Job names within the AI_BACKGROUND queue */
export const AI_BACKGROUND_JOB_NAMES = {} as const;

/** Job names within the BULK_OPS queue */
export const BULK_OPS_JOB_NAMES = {
  JOB_CLEANUP: 'job-cleanup',
  DATA_RETENTION: 'data-retention',
  LOGIN_EVENTS_CLEANUP: 'login-events-cleanup',
  TOKENS_CLEANUP: 'tokens-cleanup',
  // Moves tenants whose trial has ended to TRIAL_EXPIRED (TrialExpiryService).
  TRIAL_EXPIRY: 'trial-expiry',
  // A no-op every five minutes whose one log line proves Redis, the scheduler and a consumer all work.
  OPS_HEARTBEAT: 'ops-heartbeat',
  // The outbox relay tick (ADR "Outbox and deadlines"): publishes what a crash left unpublished.
  OUTBOX_RELAY: 'outbox-relay',
  // The deadline sweeper tick (ADR "Outbox and deadlines"): fires timers that came due.
  DEADLINE_SWEEP: 'deadline-sweep',
} as const;

/**
 * Build a BullMQ-safe `jobId` from a DB Job row's numeric id.
 *
 * BullMQ rejects custom job IDs that are pure-integer strings — its validator
 * throws "Custom Id cannot be integers" when `parseInt(jobId, 10).toString()`
 * round-trips to the same value. Prefixing with the category (e.g.
 * `"bulk-ops-48414"`) gives a deterministic, non-numeric token that satisfies
 * BullMQ AND remains stable for dedupe/lookup.
 */
export function bullJobIdFromDbId(category: string, dbId: number | bigint | string): string {
  return `${category}-${dbId}`;
}

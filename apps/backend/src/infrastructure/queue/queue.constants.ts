/**
 * Sally Queue Topology (v2 — 2026-05-27 redesign)
 *
 * Queues are grouped by failure-domain tier. See .docs/technical/queue-architecture.md.
 *
 * Tier 1 — Real-time (humans/safety/trucks waiting)
 *  events         : durable event bus, fan-out spine
 *  telemetry      : ELD/GPS/sensor ingest; safety-critical SLA
 *  safety-detect  : compliance audits, HOS rules, geofence, load monitoring
 *  notifications  : outbound SMS/push/email/in-app (priority enforced)
 *  webhooks       : outbound webhooks to customer systems
 *
 * Tier 2 — Vendor (one bad vendor must not block the rest)
 *  vendor-data    : Samsara/QB/EDI/fuel/load-board ingest (per-vendor circuit breakers)
 *
 * Tier 3 — Compute (background but matters)
 *  documents      : OCR, parsing, doc AI
 *  geo-compute    : routing, mileage, ETAs
 *  finance        : transactional financial ops
 *  ai-interactive : RESERVED — user-blocking AI (chat, copilot)
 *  ai-background  : RESERVED — BullMQ-shaped autonomous AI; today most Desk runs on Inngest
 *
 * Tier 4 — Slow lane (eventual is fine)
 *  bulk-ops       : mass operations + system cleanup (job-cleanup, data-retention)
 *  analytics      : RESERVED — reports, rollups, dashboard pre-warming
 *  replays        : RESERVED — admin replay endpoint enqueues failed jobs here
 */
export const QUEUE_NAMES = {
  EVENTS: 'events',
  TELEMETRY: 'telemetry',
  SAFETY_DETECT: 'safety-detect',
  NOTIFICATIONS: 'notifications',
  WEBHOOKS: 'webhooks',
  VENDOR_DATA: 'vendor-data',
  DOCUMENTS: 'documents',
  GEO_COMPUTE: 'geo-compute',
  FINANCE: 'finance',
  AI_INTERACTIVE: 'ai-interactive',
  AI_BACKGROUND: 'ai-background',
  BULK_OPS: 'bulk-ops',
  ANALYTICS: 'analytics',
  REPLAYS: 'replays',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job names within the EVENTS queue — dynamic event names; no fixed list */
export const EVENTS_JOB_NAMES = {} as const;

/** Job names within the TELEMETRY queue */
export const TELEMETRY_JOB_NAMES = {
  HOS: 'hos',
  GPS: 'gps',
  DVIR: 'dvir',
  FLEET_SYNC: 'fleet-sync',
} as const;

/** Job names within the SAFETY_DETECT queue */
export const SAFETY_DETECT_JOB_NAMES = {
  AUDIT: 'audit',
  LOAD_MONITORING: 'load-monitoring',
} as const;

/** Job names within the NOTIFICATIONS queue */
export const NOTIFICATIONS_JOB_NAMES = {
  CLEANUP: 'cleanup',
  DOCUMENT_EXPIRY: 'document-expiry',
  INVOICE_OVERDUE: 'invoice-overdue',
  ALERT_ESCALATION: 'alert-escalation',
  ALERT_UNSNOOZE: 'alert-unsnooze',
  ALERT_DIGEST: 'alert-digest',
  SHIFT_SUMMARY: 'shift-summary',
} as const;

/** Job names within the WEBHOOKS queue */
export const WEBHOOKS_JOB_NAMES = {
  DELIVER: 'deliver',
} as const;

/** Job names within the VENDOR_DATA queue */
export const VENDOR_DATA_JOB_NAMES = {
  TMS_DRIVERS: 'tms-drivers',
  TMS_VEHICLES: 'tms-vehicles',
  TMS_LOADS: 'tms-loads',
  OAUTH_REFRESH: 'oauth-refresh',
  EDI_TENDER_EXPIRY: 'edi-tender-expiry',
  LOAD_BOARD_POLL: 'load-board-poll',
  LANES_AUTO_GENERATION: 'lanes-auto-generation',
  LANES_RETRY_SINGLE: 'lanes-retry-single',
} as const;

/** Job names within the DOCUMENTS queue */
export const DOCUMENTS_JOB_NAMES = {
  RATECON: 'ratecon',
  PROCESS_EMAIL: 'process-email',
  PARSE_ATTACHMENT: 'parse-attachment',
} as const;

/** Job names within the GEO_COMPUTE queue */
export const GEO_COMPUTE_JOB_NAMES = {
  ROUTE_PROGRESS: 'route-progress',
  LOAD_MILEAGE_RECALC: 'load-mileage-recalc',
} as const;

/** Job names within the FINANCE queue */
export const FINANCE_JOB_NAMES = {
  INVOICE: 'invoice',
  SETTLEMENT: 'settlement',
  PAYMENT: 'payment',
  SETTLEMENT_PAYMENT: 'settlement-payment',
  WEBHOOK_PAYMENT: 'webhook-payment',
  WEBHOOK_BILL_PAYMENT: 'webhook-bill-payment',
  INITIAL_SYNC: 'initial-sync',
  TRIAL_EXPIRY: 'trial-expiry',
  ADDON_USAGE_RESET: 'addon-usage-reset',
} as const;

/** Job names within the BULK_OPS queue */
export const BULK_OPS_JOB_NAMES = {
  JOB_CLEANUP: 'job-cleanup',
  DATA_RETENTION: 'data-retention',
  UPLOADS_CLEANUP: 'uploads-cleanup',
  LOGIN_EVENTS_CLEANUP: 'login-events-cleanup',
  TOKENS_CLEANUP: 'tokens-cleanup',
} as const;

/**
 * Build a BullMQ-safe `jobId` from a DB Job row's numeric id.
 *
 * BullMQ rejects custom job IDs that are pure-integer strings — its validator
 * throws "Custom Id cannot be integers" when `parseInt(jobId, 10).toString()`
 * round-trips to the same value. That used to be fine because our `jobs` table
 * had CUID PKs (`"clxabc123..."` — contained letters). After the CUID → Int PK
 * migration (PR #734/735), `job.id` is numeric and `String(job.id)` is now
 * always pure digits — which breaks every `queue.add(name, payload, { jobId })`
 * callsite that paired the DB row to the BullMQ job.
 *
 * Prefixing with the category (e.g. `"documents-48414"`) gives a deterministic,
 * non-numeric token that satisfies BullMQ AND remains stable for dedupe/lookup.
 */
export function bullJobIdFromDbId(category: string, dbId: number | bigint | string): string {
  return `${category}-${dbId}`;
}

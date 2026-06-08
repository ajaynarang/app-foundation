/**
 * Display-name maps for the background-jobs admin UI.
 *
 * Single source of truth for both the backend (`apps/backend/src/infrastructure/queue/job.types.ts`)
 * and the web app (`apps/web/src/features/system-activity/types.ts`). Both apps re-export from here.
 *
 * Category names mirror the keys of `JOB_CATEGORIES` in the backend `job.types.ts`; the display
 * values match the `.display` field on each category entry there.
 *
 * Keys are `Job.type` (the payload `type` field stored on the `jobs` row) — NOT the BullMQ job name.
 * For most jobs the two coincide; the historical exceptions are the vendor TMS syncs (Job.type stays
 * `drivers`/`vehicles`/`loads`/`hos`/`gps`/`dvir`/`fleet-sync` while the BullMQ name is `tms-*`) and
 * lane auto-generation (Job.type is `auto-generation`; BullMQ name is `lanes-auto-generation`). A missing
 * entry just renders the raw type string, so we deliberately cover both the persisted type AND the
 * BullMQ job name where they diverge.
 */

export const TYPE_DISPLAY_NAMES: Record<string, string> = {
  // telemetry (ELD/GPS/sensor ingest)
  hos: 'HOS',
  gps: 'GPS',
  dvir: 'DVIR',
  'fleet-sync': 'Fleet Sync',
  // safety & compliance
  audit: 'Audit',
  'load-monitoring': 'Active Load Monitoring',
  // notifications
  cleanup: 'Notification Cleanup',
  'document-expiry': 'Document Expiry Check',
  'invoice-overdue': 'Invoice Overdue Check',
  'alert-escalation': 'Alert Escalation',
  'alert-unsnooze': 'Alert Unsnooze',
  'alert-digest': 'Daily Alert Digest',
  'shift-summary': 'Shift Change Summary',
  // webhooks
  deliver: 'Delivery',
  // vendor sync (Job.type stays drivers/vehicles/loads for the TMS syncs)
  drivers: 'Drivers',
  vehicles: 'Vehicles',
  loads: 'Loads',
  'oauth-refresh': 'OAuth Token Refresh',
  'token-refresh': 'Token Refresh',
  'edi-tender-expiry': 'Tender Expiry Check',
  'load-board-poll': 'Load Board Poll',
  'auto-generation': 'Lane Auto-Generation',
  'lanes-auto-generation': 'Lane Auto-Generation',
  'lanes-retry-single': 'Lane Retry',
  // documents
  ratecon: 'Rate Confirmation',
  'process-email': 'Email Processing',
  'parse-attachment': 'Attachment Parsing',
  // routing & geo
  'route-progress': 'Route Plan Progress',
  'load-mileage-recalc': 'Load Mileage Recalc',
  // finance
  invoice: 'Invoice',
  settlement: 'Settlement',
  payment: 'Payment',
  'settlement-payment': 'Settlement Payment',
  'webhook-payment': 'Payment (from QB)',
  'webhook-bill-payment': 'Bill Payment (from QB)',
  'initial-sync': 'Initial Sync',
  'trial-expiry': 'Trial Expiry',
  'addon-usage-reset': 'Add-On Usage Reset',
  // system maintenance (bulk-ops)
  'job-cleanup': 'Job Record Cleanup',
  'data-retention': 'Data Retention Cleanup',
  'uploads-cleanup': 'Expired Uploads',
  'login-events-cleanup': 'Login Events',
  'tokens-cleanup': 'Refresh Tokens',
  // legacy maintenance type labels (pre-rekey rows still in the Job table)
  uploads: 'Expired Uploads',
  'login-events': 'Login Events',
  tokens: 'Refresh Tokens',
};

/**
 * Category display names. Derived from `JOB_CATEGORIES[*].display` in the backend `job.types.ts` —
 * keep in sync if categories are added or renamed there.
 */
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  telemetry: 'Telemetry',
  safety: 'Safety & Compliance',
  notifications: 'Notifications',
  webhooks: 'Webhooks',
  vendor: 'Vendor Sync',
  documents: 'Documents',
  geo: 'Routing & Geo',
  finance: 'Finance',
  events: 'Domain Events',
  maintenance: 'System Maintenance',
};

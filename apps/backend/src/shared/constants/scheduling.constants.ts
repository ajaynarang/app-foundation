/** Local clock hour (0–23) at which tenant-local "morning" scheduled jobs fire. */
export const DIGEST_LOCAL_HOUR = 8;

/** `jobKey` values for TenantJobRun per-day idempotency stamps. */
export const TENANT_JOB_KEYS = {
  NOTIFICATION_DIGEST: 'notification-digest',
} as const;

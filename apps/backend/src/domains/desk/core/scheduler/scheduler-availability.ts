import { invalidState } from '@appshore/kernel/shared/errors/api-errors';

/**
 * Platform switch for Desk's automatic runs (docs/operations.md, "Process switches").
 *
 * Inngest bills every cron tick, so the scheduler heartbeat costs executions in every environment even when no
 * tenant schedules anything. `DESK_SCHEDULER_ENABLED=false` keeps the heartbeat from being registered with Inngest at
 * all. It sits above the tenant master switch (`Tenant.deskScheduleEnabled`): while it is off nothing runs on a
 * schedule for any tenant, and turning a tenant's schedule on is refused (409 INVALID_STATE) rather than stored as a
 * setting that could not take effect. Pausing is always allowed, and "Run now" and event-driven Desk functions are
 * unaffected.
 *
 * Unset (or empty) means on, so local dev keeps running the heartbeat. Only `false`, `0` or `off` turn it off.
 */
export const DESK_SCHEDULER_ENABLED_ENV = 'DESK_SCHEDULER_ENABLED';

/** The copy a refused "turn automatic runs on" shows. */
export const DESK_SCHEDULES_PAUSED_DETAIL =
  'Automatic Desk runs are turned off for this environment, so a schedule cannot be turned on. Run now still works.';

const OFF_VALUES = new Set(['false', '0', 'off']);

export function isDeskSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[DESK_SCHEDULER_ENABLED_ENV]?.trim().toLowerCase();
  return !raw || !OFF_VALUES.has(raw);
}

/** Guard for every "turn automatic runs on" write. Throws 409 INVALID_STATE while the platform switch is off. */
export function assertAutomaticSchedulesAvailable(env: NodeJS.ProcessEnv = process.env): void {
  if (isDeskSchedulerEnabled(env)) return;
  throw invalidState(DESK_SCHEDULES_PAUSED_DETAIL);
}

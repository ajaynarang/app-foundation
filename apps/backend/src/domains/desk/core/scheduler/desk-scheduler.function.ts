import type { Inngest, InngestFunction } from 'inngest';

import { nestApp } from '../inngest/nest-context';

import { DeskSchedulerService } from './desk-scheduler.service';

/** Every minute, evaluated in UTC by Inngest. The heartbeat resolves each
 *  tenant's IANA timezone when checking a responsibility's cron, so this
 *  fixed UTC schedule is correct regardless of tenant locale. */
export const HEARTBEAT_CRON = '* * * * *';

/**
 * Desk scheduler heartbeat — Inngest cron function.
 *
 * Fires every minute. Pulls `DeskSchedulerService` from the Nest DI container
 * (via the `nestApp()` bridge — the same pattern the responsibility step
 * handlers use, since Inngest handlers are plain async functions, not Nest
 * classes) and runs the heartbeat: find tenants/responsibilities whose cron
 * is due in the just-elapsed minute and dispatch their run events.
 *
 * Migrated from the BullMQ `DESK_SCHEDULER` queue in the 2026-05-27 queue
 * topology redesign (Phase 5). The rest of Desk already runs on Inngest, so
 * the heartbeat now lives here too — one orchestration runtime, not two.
 *
 * Shape mirrors a responsibility's event-triggered Inngest function — same
 * `triggers: [...]` config and `client.createFunction(config, handler)` call —
 * with the event trigger swapped for a `cron` trigger.
 *
 * The tick time is resolved inside a step so an Inngest retry replays the
 * original minute rather than re-reading the clock (the per-day idempotency
 * keys + the Postgres partial unique index on open episodes already make a
 * rare double-tick safe; this just keeps the window deterministic on retry).
 */
export function createDeskSchedulerFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'desk-scheduler-heartbeat',
      name: 'Desk Scheduler Heartbeat',
      triggers: [{ cron: HEARTBEAT_CRON }],
    },
    deskSchedulerHandler,
  );
}

/**
 * Handler extracted from the factory so it reads cleanly and stays the only
 * thing the cron triggers. Kept tiny on purpose: all heartbeat logic (the
 * two-switch gating, cron-window math, per-row dispatch) lives in
 * `DeskSchedulerService.runHeartbeat`, which is unit-tested directly.
 */
export const deskSchedulerHandler = async ({
  step,
}: {
  step: { run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T> };
}) => {
  const tickTime = await step.run('resolve-tick', () => new Date().toISOString());
  const scheduler = nestApp().get(DeskSchedulerService);
  await scheduler.runHeartbeat(new Date(tickTime));
  return { tickTime };
};

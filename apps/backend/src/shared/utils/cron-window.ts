import { CronExpressionParser } from 'cron-parser';

/**
 * Pure cron-window matcher — the heart of the Desk scheduler.
 *
 * Given a cron expression, an IANA timezone, and the just-elapsed
 * one-minute window `[windowStart, windowEnd)`, decide whether a scheduled
 * fire-time fell inside that window. The cron is evaluated in `tz`, so a
 * "daily at 9:00" responsibility fires at 9:00 in the TENANT's wall clock,
 * not UTC.
 *
 * Window semantics — inclusive start, exclusive end:
 *   - A fire-time exactly at `windowStart` IS due (this tick).
 *   - A fire-time exactly at `windowEnd` is NOT due (next tick's start).
 * This guarantees each scheduled minute is matched by exactly one tick, so
 * a fire-time is never double-counted across two adjacent heartbeats.
 *
 * `cron-parser`'s `next()` returns the next fire STRICTLY after its
 * `currentDate`; seeding it with `windowStart - 1ms` makes `windowStart`
 * itself reachable, giving the inclusive-start behavior.
 *
 * Invalid cron / timezone / empty window all return `false` (never throw) —
 * a malformed registry trigger must skip the responsibility, never crash the
 * heartbeat that serves every other tenant.
 */
export function isCronDueInWindow(cronExpr: string, tz: string, windowStart: Date, windowEnd: Date): boolean {
  if (windowStart.getTime() >= windowEnd.getTime()) return false;

  try {
    const iterator = CronExpressionParser.parse(cronExpr, {
      currentDate: new Date(windowStart.getTime() - 1),
      tz,
    });
    const fireTime = iterator.next().toDate().getTime();
    return fireTime >= windowStart.getTime() && fireTime < windowEnd.getTime();
  } catch {
    return false;
  }
}

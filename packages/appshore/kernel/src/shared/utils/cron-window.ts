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

/** Fire times sampled to find a cron's interval; enough to see a weekday-only or `0,30` pattern's shortest gap. */
const INTERVAL_SAMPLES = 8;

/**
 * How often a cron pattern fires, in seconds: the shortest gap between its next fire times after `from`. A pattern
 * with uneven gaps (`0 9,17 * * *`) reports the shorter one, so a "missed run" check never waits longer than the
 * pattern means. Undefined for a pattern that cannot be parsed or fires fewer than twice.
 */
export function cronIntervalSeconds(cronExpr: string, tz = 'UTC', from: Date = new Date()): number | undefined {
  try {
    const iterator = CronExpressionParser.parse(cronExpr, { currentDate: from, tz });
    const times: number[] = [];
    for (let i = 0; i < INTERVAL_SAMPLES && iterator.hasNext(); i++) times.push(iterator.next().toDate().getTime());
    if (times.length < 2) return undefined;
    let shortest = Infinity;
    for (let i = 1; i < times.length; i++) shortest = Math.min(shortest, times[i] - times[i - 1]);
    return shortest / 1000;
  } catch {
    return undefined;
  }
}

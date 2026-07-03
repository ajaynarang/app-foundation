import { isCronDueInWindow } from '../cron-window';

/**
 * Pure-function coverage for the cron-window matcher — the core scheduler
 * decision. A scheduled fire-time counts as "due" when it falls in the
 * just-elapsed one-minute window `[windowStart, windowEnd)` evaluated in the
 * resolved timezone. Inclusive start, exclusive end — so the same minute is
 * never double-counted across two adjacent ticks.
 */

/** A one-minute window ending at `tickIso` (exclusive). */
function windowEndingAt(tickIso: string): { windowStart: Date; windowEnd: Date } {
  const windowEnd = new Date(tickIso);
  return { windowStart: new Date(windowEnd.getTime() - 60_000), windowEnd };
}

describe('isCronDueInWindow', () => {
  describe('daily at 09:00, tenant timezone', () => {
    const CRON = '0 9 * * *';
    const TZ = 'America/Chicago'; // CDT in May = UTC-5, so 09:00 local == 14:00 UTC

    it('is due on the tick whose window opens exactly at the fire-time', () => {
      // 09:00 CDT == 14:00:00Z; window [14:00:00Z, 14:01:00Z) contains it (inclusive start).
      const { windowStart, windowEnd } = windowEndingAt('2026-05-22T14:01:00.000Z');
      expect(isCronDueInWindow(CRON, TZ, windowStart, windowEnd)).toBe(true);
    });

    it('is NOT due on the prior tick whose window closes exactly at the fire-time', () => {
      // window [13:59:00Z, 14:00:00Z) — fire-time 14:00:00Z is the exclusive end, excluded.
      const { windowStart, windowEnd } = windowEndingAt('2026-05-22T14:00:00.000Z');
      expect(isCronDueInWindow(CRON, TZ, windowStart, windowEnd)).toBe(false);
    });

    it('is not due on an unrelated minute', () => {
      const { windowStart, windowEnd } = windowEndingAt('2026-05-22T18:30:00.000Z');
      expect(isCronDueInWindow(CRON, TZ, windowStart, windowEnd)).toBe(false);
    });

    it('resolves the same wall-clock fire-time differently by timezone', () => {
      // 09:00 New York (EDT, UTC-4) == 13:00:00Z; window opening 13:00:00Z is due.
      const ny = windowEndingAt('2026-05-22T13:01:00.000Z');
      expect(isCronDueInWindow(CRON, 'America/New_York', ny.windowStart, ny.windowEnd)).toBe(true);
      // ...but Chicago's 09:00 is 14:00Z, so the NY window is not Chicago-due.
      expect(isCronDueInWindow(CRON, 'America/Chicago', ny.windowStart, ny.windowEnd)).toBe(false);
    });
  });

  describe('weekly Monday at 08:00 (UTC)', () => {
    const CRON = '0 8 * * 1';

    it('is due on Monday at 08:00', () => {
      // 2026-05-25 is a Monday.
      const { windowStart, windowEnd } = windowEndingAt('2026-05-25T08:01:00.000Z');
      expect(isCronDueInWindow(CRON, 'UTC', windowStart, windowEnd)).toBe(true);
    });

    it('is not due on Tuesday at 08:00', () => {
      const { windowStart, windowEnd } = windowEndingAt('2026-05-26T08:01:00.000Z');
      expect(isCronDueInWindow(CRON, 'UTC', windowStart, windowEnd)).toBe(false);
    });
  });

  describe('every 15 minutes (UTC)', () => {
    const CRON = '*/15 * * * *';

    it('is due on the window opening at a 15-minute boundary', () => {
      const { windowStart, windowEnd } = windowEndingAt('2026-05-22T12:16:00.000Z'); // contains 12:15:00
      expect(isCronDueInWindow(CRON, 'UTC', windowStart, windowEnd)).toBe(true);
    });

    it('is not due in a window between boundaries', () => {
      const { windowStart, windowEnd } = windowEndingAt('2026-05-22T12:10:00.000Z'); // [12:09,12:10)
      expect(isCronDueInWindow(CRON, 'UTC', windowStart, windowEnd)).toBe(false);
    });
  });

  describe('robustness', () => {
    it('returns false (does not throw) on an invalid cron expression', () => {
      const { windowStart, windowEnd } = windowEndingAt('2026-05-22T14:01:00.000Z');
      expect(isCronDueInWindow('not a cron', 'UTC', windowStart, windowEnd)).toBe(false);
    });

    it('returns false (does not throw) on an invalid timezone', () => {
      const { windowStart, windowEnd } = windowEndingAt('2026-05-22T14:01:00.000Z');
      expect(isCronDueInWindow('0 9 * * *', 'Not/AZone', windowStart, windowEnd)).toBe(false);
    });

    it('returns false when the window is empty (start >= end)', () => {
      const t = new Date('2026-05-22T14:00:00.000Z');
      expect(isCronDueInWindow('* * * * *', 'UTC', t, t)).toBe(false);
    });
  });
});

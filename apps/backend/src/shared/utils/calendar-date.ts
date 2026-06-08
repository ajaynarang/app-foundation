/**
 * Format a Date as `YYYY-MM-DD` in UTC, preserving the calendar date.
 *
 * Prisma returns `@db.Date` columns as `Date` at UTC midnight. Applying a
 * local-timezone conversion (e.g., `toISOString().split('T')[0]` from a
 * Date stored in a timezone east of UTC) shifts the day by -1. This
 * helper uses `getUTC*()` to read the stored calendar date verbatim.
 *
 * See memory `date-time-handling.md` for the full rationale.
 */
export function toUtcCalendarDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Today in UTC at 00:00:00.000 — the lower bound for "window of today +
 * N days" calendar-date queries.
 */
export function startOfUtcToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Add `days` UTC days to `base`, returning a new Date. */
export function addUtcDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

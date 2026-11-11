/**
 * Calendar-date primitives (`YYYY-MM-DD`, no timezone) the page chrome needs. The one implementation:
 * `@appshore/web-core/shared/lib/utils/date-utils` re-exports these — `@app/ui` cannot import web-core.
 */

/** The compact display format a date-range label uses ("Feb 28"). */
export const CALENDAR_DATE_COMPACT = 'MMM d';

export function parseCalendarDate(dateStr: string): { year: number; month: number; day: number } {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return { year, month, day };
}

export function dateToCalendarDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shift a calendar date by whole days (`addCalendarDays('2026-03-01', -1)` → `'2026-02-28'`). No timezone involved. */
export function addCalendarDays(dateStr: string, days: number): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

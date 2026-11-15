import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { parseCalendarDate } from '@app/ui/lib/calendar-date';

// Calendar-date primitives the page chrome needs live in @app/ui (it cannot import web-core); one implementation.
export { addCalendarDays, dateToCalendarDate, parseCalendarDate } from '@app/ui/lib/calendar-date';

// ============================================================================
// DATE FORMAT CONSTANTS
// Use these instead of raw format strings for consistency across the app.
// ============================================================================

/** Contextual display formats — use by UI context, not by preference */
export const DISPLAY_FORMATS = {
  /** Full friendly date: "Feb 28, 2026" — detail views, sheets, tables */
  FRIENDLY: 'MMM d, yyyy',
  /** Compact date: "Feb 28" — cards, badges, chart labels, filter pills */
  COMPACT: 'MMM d',
  /** Full date + time: "Feb 28, 2026, 3:30 PM" — timestamps, activity feeds */
  DATE_TIME: 'MMM d, yyyy, h:mm a',
  /** Compact date + time: "Feb 28, 3:30 PM" — activity feed, load events */
  COMPACT_DATE_TIME: 'MMM d, h:mm a',
  /** Time only: "3:30 PM" — job details, schedules, ETA */
  TIME_ONLY: 'h:mm a',
  /** Month + year: "February 2026" — profile "member since", billing */
  MONTH_YEAR: 'MMMM yyyy',
  /** Full month + day + year: "February 28, 2026" — formal documents */
  FULL: 'MMMM d, yyyy',
} as const;

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * True for a real calendar day in `YYYY-MM-DD` form. The shape alone is not enough: `2026-99-99` or `2026-02-30`
 * would overflow into another date (2034-06-07, 2026-03-02) wherever it is turned into an instant.
 */
export function isCalendarDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this one (UTC, so no DST or local-zone drift).
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatCalendarDate(dateStr: string | null | undefined, fmt: string = 'MM/DD/YYYY'): string {
  if (!dateStr) return '\u2014';

  const { year, month, day } = parseCalendarDate(dateStr);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '\u2014';
  const mm = month.toString().padStart(2, '0');
  const dd = day.toString().padStart(2, '0');

  switch (fmt) {
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${mm}-${dd}`;
    case 'MMM d':
      return `${MONTH_ABBR[month]} ${day}`;
    case 'MMM d, yyyy':
      return `${MONTH_ABBR[month]} ${day}, ${year}`;
    case 'MM/DD/YYYY':
    default:
      return `${mm}/${dd}/${year}`;
  }
}

export function calendarDateToday(timezone: string = 'America/New_York'): string {
  const now = new TZDate(new Date(), timezone);
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function compareCalendarDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isCalendarDateBefore(dateStr: string, timezone: string = 'America/New_York'): boolean {
  return compareCalendarDates(dateStr, calendarDateToday(timezone)) < 0;
}

export function formatTimestamp(
  isoString: string | null | undefined,
  timezone: string,
  fmt: string = 'MMM d, yyyy, h:mm a',
): string {
  if (!isoString) return '\u2014';
  try {
    const tzDate = new TZDate(isoString, timezone);
    return format(tzDate, fmt);
  } catch {
    return '\u2014';
  }
}

export function formatTimestampDate(
  isoString: string | null | undefined,
  timezone: string,
  fmt: string = 'MMM d, yyyy',
): string {
  return formatTimestamp(isoString, timezone, fmt);
}

export function calendarDateToDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

/**
 * The instant a calendar day starts or ends in a timezone, as an ISO-8601 UTC string.
 * Use it to turn a date-range filter (`YYYY-MM-DD`, read in the user's timezone) into the
 * inclusive `from` / `to` bounds an API expects.
 */
export function calendarDateToInstant(dateStr: string, timezone: string, edge: 'start' | 'end'): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const zoned =
    edge === 'start'
      ? new TZDate(year, month - 1, day, 0, 0, 0, 0, timezone)
      : new TZDate(year, month - 1, day, 23, 59, 59, 999, timezone);
  return new Date(zoned.getTime()).toISOString();
}

import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';

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

export function isCalendarDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseCalendarDate(dateStr: string): { year: number; month: number; day: number } {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return { year, month, day };
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

export function dateToCalendarDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

import { addCalendarDays, dateToCalendarDate } from './calendar-date';

/**
 * Date-range presets — pure (no React), so list URL state and tests can resolve them.
 *
 * `getRange(today)` takes "today" as a calendar date. Callers that turn the range into
 * instants in a timezone MUST pass today's date in that SAME timezone
 * (`calendarDateToday(timezone)`); otherwise a browser whose local date is behind the
 * timezone's date ends the range before now. Omitted, it is the browser's local date.
 */
export interface DateRangePresetOption {
  value: string;
  label: string;
  /** The value alone, for a trigger collapsed to icon + value below `lg` ("30d"). Defaults to `label`. */
  shortLabel?: string;
  getRange: (today?: string) => { from: string; to: string };
}

export function toDateStr(date: Date): string {
  return dateToCalendarDate(date);
}

function daysAgoRange(days: number, today: string = toDateStr(new Date())): { from: string; to: string } {
  return { from: addCalendarDays(today, -days), to: today };
}

/**
 * Get the Monday of the week containing the given date (Monday-Sunday weeks).
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // Sunday → go back 6 days
  d.setDate(d.getDate() - diff);
  return d;
}

export const HISTORY_PRESETS: DateRangePresetOption[] = [
  { value: 'today', label: 'Today', getRange: (today) => daysAgoRange(0, today) },
  { value: '7d', label: 'Last 7 days', shortLabel: '7d', getRange: (today) => daysAgoRange(7, today) },
  { value: '30d', label: 'Last 30 days', shortLabel: '30d', getRange: (today) => daysAgoRange(30, today) },
  { value: '90d', label: 'Last 90 days', shortLabel: '90d', getRange: (today) => daysAgoRange(90, today) },
];

export const PERIOD_PRESETS: DateRangePresetOption[] = [
  {
    value: 'this-week',
    label: 'This Week',
    getRange: () => {
      const today = new Date();
      const monday = getMonday(today);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toDateStr(monday), to: toDateStr(sunday) };
    },
  },
  {
    value: 'last-week',
    label: 'Last Week',
    getRange: () => {
      const today = new Date();
      const thisMonday = getMonday(today);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: toDateStr(lastMonday), to: toDateStr(lastSunday) };
    },
  },
  {
    value: 'this-month',
    label: 'This Month',
    getRange: () => {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toDateStr(firstDay), to: toDateStr(lastDay) };
    },
  },
];

import { DateTime } from 'luxon';

/**
 * SQ-97 — Appointment window construction (pure, side-effect free).
 *
 * A LoadStop stores three pieces:
 *   - appointmentDate  Date  (@db.Date — date only, YYYY-MM-DD)
 *   - earliestArrival  String (HH:MM 24-hour, e.g. "02:15")
 *   - latestArrival    String (HH:MM 24-hour)
 * and the parent Stop carries its IANA `timezone` (e.g. "America/New_York").
 *
 * Prior to this commit, the planner read `earliestArrival`/`latestArrival`
 * via `new Date()` (today!) and ignored `appointmentDate` entirely, which
 * collapsed every pickup window to "today at HH:MM" and produced plans
 * that scheduled a pickup ~17 hours before the actual appointment.
 *
 * This helper combines all three values into a proper UTC Date by anchoring
 * on the appointment date and time in the stop's timezone. If either the
 * date or time pieces are missing, the window is `undefined` — the planner
 * has nothing to enforce.
 *
 * NOTE per memory `date-time-handling.md`: never construct a Date with
 * `new Date(dateOnlyString)` — Postgres `@db.Date` columns serialize as
 * `"2026-05-10"` and `new Date("2026-05-10")` is parsed as UTC midnight,
 * shifting to the previous day in any negative-offset timezone. Use Luxon
 * with explicit year/month/day fields instead.
 */
export interface AppointmentWindow {
  start: Date;
  end: Date;
}

export interface LoadStopForWindow {
  appointmentDate?: Date | null;
  earliestArrival?: string | null;
  latestArrival?: string | null;
}

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function combineDateAndTime(date: Date, hhmm: string, timezone: string): Date | null {
  const match = HHMM_RE.exec(hhmm);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  // Use UTC parts of the appointmentDate to avoid the host TZ shifting the
  // calendar day — Prisma returns @db.Date as a Date at midnight UTC.
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const dt = DateTime.fromObject({ year, month, day, hour, minute }, { zone: timezone });
  if (!dt.isValid) return null;
  return dt.toJSDate();
}

/**
 * Optional facility fallback: when a stop has no per-load appointment window, the
 * planner should still avoid scheduling arrival at a closed dock. If the facility
 * publishes operatingHours for the relevant weekday, treat those as the window.
 * A confirmed per-load appointment always takes precedence over operating hours.
 */
export interface FacilityForWindow {
  operatingHours?: unknown; // { "mon": ["08:00","17:00"], ... }
  appointmentRequired?: boolean;
  /** Calendar date to resolve the weekday against when no appointmentDate exists. */
  referenceDate?: Date;
}

function operatingHoursWindow(facility: FacilityForWindow, timezone: string): AppointmentWindow | undefined {
  const oh = facility.operatingHours;
  if (!oh || typeof oh !== 'object') return undefined;
  const anchor = facility.referenceDate ?? new Date();
  const ymd = {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  };
  const weekday = DateTime.fromObject(ymd, { zone: timezone }).toFormat('ccc').toLowerCase(); // 'mon'..'sun'
  const entry = (oh as Record<string, unknown>)[weekday];
  if (!Array.isArray(entry) || entry.length < 2) return undefined;
  const [open, close] = entry;
  if (typeof open !== 'string' || typeof close !== 'string') return undefined;
  const dateForCombine = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  const start = combineDateAndTime(dateForCombine, open, timezone);
  const end = combineDateAndTime(dateForCombine, close, timezone);
  if (!start || !end) return undefined;
  return { start, end };
}

export function buildAppointmentWindow(
  loadStop: LoadStopForWindow,
  timezone: string,
  facility?: FacilityForWindow,
): AppointmentWindow | undefined {
  // 1. Per-load appointment (customer-confirmed) wins.
  if (loadStop.appointmentDate && loadStop.earliestArrival && loadStop.latestArrival) {
    const start = combineDateAndTime(loadStop.appointmentDate, loadStop.earliestArrival, timezone);
    const end = combineDateAndTime(loadStop.appointmentDate, loadStop.latestArrival, timezone);
    if (start && end) return { start, end };
  }
  // 2. Facility operating hours, so we never schedule arrival at a closed dock.
  if (facility) return operatingHoursWindow(facility, timezone);
  return undefined;
}

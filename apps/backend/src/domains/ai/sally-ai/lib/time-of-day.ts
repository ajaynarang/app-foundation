export type TimeOfDay = 'morning' | 'midday' | 'evening';

/**
 * Classify the current time-of-day bucket (`morning` / `midday` / `evening`) for
 * a tenant based on its local timezone.
 *
 * Boundaries:
 *   hour <  11 → morning
 *   hour <  16 → midday
 *   else       → evening
 *
 * Invalid IANA timezones fall back to UTC-based bucketing so the caller never
 * throws on misconfigured tenant settings.
 */
export function classifyTimeOfDay(now: Date, timezone: string): TimeOfDay {
  let hour: number;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    hour = Number(fmt.format(now));
    if (Number.isNaN(hour)) throw new Error('NaN');
  } catch {
    hour = now.getUTCHours();
  }
  if (hour < 11) return 'morning';
  if (hour < 16) return 'midday';
  return 'evening';
}

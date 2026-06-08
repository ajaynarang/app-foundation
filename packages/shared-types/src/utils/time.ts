/**
 * Shared time-string utilities.
 * Operates on HH:MM strings used for stop appointment times.
 */

/**
 * Clamp an HH:MM time string so hours stay within 00–23 and minutes within 00–59.
 * Returns undefined for falsy input; returns the original string if it doesn't match HH:MM.
 *
 * Examples:
 *  "25:00" → "23:00"
 *  "08:75" → "08:59"
 *  "14:30" → "14:30"
 */
export function normalizeTimeString(time: string | undefined | null): string | undefined {
  if (!time) return undefined;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  const hours = Math.min(parseInt(match[1], 10), 23);
  const minutes = Math.min(parseInt(match[2], 10), 59);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Helpers for converting between API-shape "HH:mm" strings and Postgres
 * `@db.Time` values (which Prisma returns as `Date` instances anchored at
 * 1970-01-01 in UTC).
 *
 * Currently unused at runtime: kept as scaffolding for domains that store
 * time-of-day columns as `@db.Time` (or as validated "HH:mm" strings).
 */

const HHMM_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse an "HH:mm" or "HH:mm:ss" string for write to the DB.
 *
 * Returns:
 *   - null if input is null/undefined
 *   - "HH:mm:ss" string suitable for Postgres TIME via Prisma (Prisma
 *     accepts a string for TIME columns — pass-through, no Date wrap)
 *
 * Throws on invalid format. Internal-only — should never receive bad
 * data because the controller validates with Zod.
 */
export function parseTimeOfDay(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  const match = HHMM_RE.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid time-of-day format: "${input}" (expected HH:mm or HH:mm:ss)`);
  }
  const [, hh, mm, ss = '00'] = match;
  const h = Number(hh);
  const m = Number(mm);
  const s = Number(ss);
  if (h > 23 || m > 59 || s > 59) {
    throw new Error(`Invalid time-of-day value: "${input}" (out of range)`);
  }
  return `${hh}:${mm}:${ss.padStart(2, '0')}`;
}

/**
 * Format a Prisma `@db.Time` value back to "HH:mm" for the API.
 *
 * Prisma returns TIME as a `Date` anchored at 1970-01-01T<time>Z. We use
 * `getUTCHours()` / `getUTCMinutes()` to read the time without a local
 * timezone shift.
 *
 * Accepts a Date OR a string ("HH:mm:ss") for resilience — some test
 * fixtures pass plain strings.
 */
export function formatTimeOfDay(input: Date | string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') {
    // already a string; return the HH:mm prefix
    return input.slice(0, 5);
  }
  const hh = String(input.getUTCHours()).padStart(2, '0');
  const mm = String(input.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

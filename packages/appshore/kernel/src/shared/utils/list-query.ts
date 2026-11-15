import { fieldError } from '../errors/api-errors';

/**
 * Parsers for the shared list query params (`sort`, `status`, `from`, `to`, `q`).
 * Each validates at the HTTP boundary: an unknown value is a 400 VALIDATION_FAILED whose `fieldErrors`
 * names the param, never a silent fallback and never an interpolated column name.
 */

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A query param as the HTTP layer really delivers it. `@Query('x') x?: string` is only a
 * hope: a repeated key (`?q=a&q=b`) arrives as an array, and calling a string method on it
 * would be a 500. Every parser below takes this type and answers a non-string with a 400.
 */
export type RawQueryValue = string | string[] | undefined;

function single(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw fieldError(label, `Send "${label}" only once`);
  return value;
}

/**
 * A param that must be sent once and is used as it is (the cursor, a public id, a key).
 * Empty → undefined; a repeated key arrives as an array — a 400, never a lookup on garbage.
 */
export function parseSingleValue(raw: RawQueryValue, label: string): string | undefined {
  const value = single(raw, label);
  return value === '' ? undefined : value;
}

/**
 * The largest page a cursor list returns. It lives here, beside the query parsers that clamp to it, so the
 * query kit does not depend on the cursor helpers.
 */
export const MAX_CURSOR_LIMIT = 100;

/** Longest search term a list accepts — longer input is cut, not rejected. */
export const MAX_LIST_SEARCH_LENGTH = 200;

// eslint-disable-next-line no-control-regex -- control characters are exactly what is being matched
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARACTER_RUNS = new RegExp(`${CONTROL_CHARACTERS.source}+`, 'g');

/** True when the text carries a control character — Postgres rejects a NUL byte in a text value outright. */
export function hasControlCharacters(value: string): boolean {
  return CONTROL_CHARACTERS.test(value);
}

const MIN_STORABLE_YEAR = 1;
const MAX_STORABLE_YEAR = 9999;

/**
 * True for a date the database can take as a parameter. JavaScript also parses expanded years
 * (`+275000-01-01`, `-200000-01-01`), which are valid Dates but fail inside the query.
 */
export function isStorableDate(date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  return year >= MIN_STORABLE_YEAR && year <= MAX_STORABLE_YEAR;
}

/**
 * Escape the LIKE wildcards in a term headed for a Prisma `contains` / `startsWith` / `endsWith`.
 * Prisma passes the term through as the pattern, so an unescaped `%` or `_` matches everything.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

/**
 * The Prisma string filter for a list search: "contains this text, any case", with the LIKE
 * wildcards escaped so `%` and `_` are matched literally. Every `q` goes through this — never a
 * hand-written `{ contains: term }`.
 */
export function containsText(term: string): { contains: string; mode: 'insensitive' } {
  return { contains: escapeLike(term), mode: 'insensitive' };
}

/**
 * Resolve `?sort=` against the endpoint's whitelist of NAMED options (`newest`,
 * `oldest`, `priority`, …). Clients never send a column or a direction.
 */
export function parseNamedSort<T extends string>(raw: RawQueryValue, allowed: readonly T[], fallback: T): T {
  const value = single(raw, 'sort');
  if (value === undefined || value === '') return fallback;
  if (!allowed.includes(value as T)) throw fieldError('sort', 'Unknown sort option');
  return value as T;
}

/**
 * Parse a multi-value enum filter. Comma-joined (`?status=OPEN,PENDING`) is the contract;
 * a repeated key (`?status=OPEN&status=PENDING`) means the same thing and is accepted.
 * Empty → undefined (no filter).
 */
export function parseEnumList<T extends string>(
  raw: RawQueryValue,
  allowed: readonly T[],
  label = 'filter',
): T[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const values: unknown[] = Array.isArray(raw) ? raw : [raw];
  if (values.some((value) => typeof value !== 'string')) throw fieldError(label, `Unknown ${label} value`);
  const parts = (values as string[])
    .flatMap((value) => value.split(','))
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.some((part) => !allowed.includes(part as T))) throw fieldError(label, `Unknown ${label} value`);
  return [...new Set(parts)] as T[];
}

/** Parse a single enum filter (`?source=EMAIL`). Empty → undefined (no filter). */
export function parseEnumValue<T extends string>(
  raw: RawQueryValue,
  allowed: readonly T[],
  label = 'filter',
): T | undefined {
  const value = single(raw, label);
  if (value === undefined || value === '') return undefined;
  if (!allowed.includes(value as T)) throw fieldError(label, `Unknown ${label} value`);
  return value as T;
}

/**
 * Parse `?from=` / `?to=`. Accepts an ISO-8601 instant (what the web sends — the day
 * boundary in the user's timezone) or a bare `YYYY-MM-DD`, read as a UTC day: `from`
 * is its first millisecond, `to` its last, so both bounds are inclusive. `label` is the param's
 * wire name when it is not `from` / `to` itself (`closed_since`).
 */
export function parseDateBound(raw: RawQueryValue, bound: 'from' | 'to', label: string = bound): Date | undefined {
  const value = single(raw, label);
  if (value === undefined || value === '') return undefined;
  const isCalendarDate = CALENDAR_DATE.test(value);
  const date = new Date(isCalendarDate ? `${value}T${bound === 'from' ? '00:00:00.000' : '23:59:59.999'}Z` : value);
  if (!isStorableDate(date)) throw fieldError(label, `Invalid "${label}" date`);
  return date;
}

/**
 * Normalize a free-text search term: control characters become spaces (a NUL byte fails the
 * query), then trimmed and capped. Empty → undefined. Call it on any term before it reaches a
 * `where` — the HTTP param, or a tool argument.
 */
export function normalizeSearchTerm(term: string | undefined | null): string | undefined {
  const cleaned = term?.replace(CONTROL_CHARACTER_RUNS, ' ').trim().slice(0, MAX_LIST_SEARCH_LENGTH).trim();
  return cleaned ? cleaned : undefined;
}

/** Parse `?q=`: one value, normalized by `normalizeSearchTerm`. */
export function parseSearchTerm(raw: RawQueryValue, label = 'q'): string | undefined {
  return normalizeSearchTerm(single(raw, label));
}

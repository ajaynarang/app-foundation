import { BadRequestException } from '@nestjs/common';
import { hasControlCharacters, isStorableDate, MAX_CURSOR_LIMIT } from './list-query';

/**
 * Cursor (keyset) pagination — the one paging model for product lists.
 *
 * A list is ordered by `(sort field, tiebreak id)`; the cursor is the position of
 * the last row the client holds. Pages stay stable while rows are inserted, and
 * nothing is skipped or repeated the way an offset shifts under writes.
 *
 * Usage in a service:
 *
 *   const take = clampCursorLimit(query.limit);
 *   const rows = await prisma.thing.findMany({
 *     where: { AND: [filters, query.cursor ? keysetWhere({ ...SORT, cursor: query.cursor }) : {}] },
 *     orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
 *     take: take + 1,                       // the probe row says whether a next page exists
 *   });
 *   return buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.publicId));
 */
export const DEFAULT_CURSOR_LIMIT = 50;
/** The page-size ceiling lives beside the query parsers that clamp to it; re-exported for list services. */
export { MAX_CURSOR_LIMIT };

const INVALID_CURSOR_MESSAGE = 'This list position is no longer valid — reload the list';

/**
 * Clamp a client-supplied page size. Missing, blank or non-numeric input falls back to the
 * default — `?limit=` is "not set", not zero (`Number('')` is 0).
 */
export function clampCursorLimit(limit?: number | string | null): number {
  if (typeof limit === 'string' && limit.trim() === '') return DEFAULT_CURSOR_LIMIT;
  const parsed = typeof limit === 'string' ? Number(limit) : limit;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_CURSOR_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_CURSOR_LIMIT);
}

export type CursorSortValue = string | number;
export type CursorId = string | number;

/** A decoded cursor: the sort value and tiebreak id of the last row on the previous page. */
export interface CursorPosition {
  sortValue: CursorSortValue;
  id: CursorId;
}

/**
 * The longest part this helper hands out is a name used as a sort value (a 255-character file
 * name); anything longer was not issued by it.
 */
const MAX_CURSOR_PART_LENGTH = 300;

function isCursorPart(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isFinite(value);
  // A control character (a NUL byte above all) would fail inside the query — a 500, not a 400.
  return typeof value === 'string' && value.length <= MAX_CURSOR_PART_LENGTH && !hasControlCharacters(value);
}

/**
 * A sort value read from a free-text column (a name, a file name). Stored text may hold a tab or
 * a newline, and the cursor for that row must still decode — only NUL is refused, because it is
 * the one character Postgres cannot store or compare.
 */
function isStoredTextPart(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_CURSOR_PART_LENGTH && !value.includes('\u0000');
}

export interface DecodeCursorOptions {
  /** The sort value is stored free text (`kind: 'text'`), so it may carry control characters. */
  textSortValue?: boolean;
}

/** Opaque to clients: base64url of `[sortValue, id]`. A Date is carried as its ISO string. */
export function encodeCursor(sortValue: Date | CursorSortValue, id: CursorId): string {
  const value = sortValue instanceof Date ? sortValue.toISOString() : sortValue;
  return Buffer.from(JSON.stringify([value, id]), 'utf8').toString('base64url');
}

/** Decode a client-supplied cursor. Anything malformed is a 400 — never a 500. */
export function decodeCursor(cursor: string, options: DecodeCursorOptions = {}): CursorPosition {
  // A repeated `?cursor=` arrives as an array — still a 400, never a TypeError.
  if (typeof cursor !== 'string') throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  const isSortValue = options.textSortValue ? isStoredTextPart : isCursorPart;
  if (!Array.isArray(parsed) || parsed.length !== 2 || !isSortValue(parsed[0]) || !isCursorPart(parsed[1])) {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  return { sortValue: parsed[0], id: parsed[1] };
}

export type KeysetDirection = 'asc' | 'desc';

export interface KeysetWhereInput {
  /** The sort column (Prisma field name), e.g. `createdAt`. Must be non-nullable. */
  field: string;
  /** The unique tiebreak column, e.g. `publicId` or `id`. Ordered in the same direction as `field`. */
  idField: string;
  direction: KeysetDirection;
  /**
   * `date` for DateTime columns, `value` for anything compared exactly (numbers, keys, enum
   * strings), `text` for a stored free-text column (a name) — compared exactly like `value`, but
   * its cursor may carry the control characters a stored name can hold.
   * Dates need their own form: the database keeps microseconds, the cursor only milliseconds.
   */
  kind: 'date' | 'value' | 'text';
  /** The raw cursor string from the client. */
  cursor: string;
}

/**
 * The Prisma `where` fragment selecting rows strictly after the cursor, for a list
 * ordered by `[{ [field]: direction }, { [idField]: direction }]`.
 *
 * For a `date` sort the cursor's millisecond is treated as a bucket: rows in an earlier
 * (or later) millisecond come next, and rows inside the same millisecond are split by the
 * tiebreak id. Comparing the truncated value with `<` / `=` instead would drop every row
 * that shares the cursor row's timestamp — e.g. a batch written by one `createMany`.
 */
export function keysetWhere(input: KeysetWhereInput): Record<string, unknown> {
  const { field, idField, direction, kind } = input;
  const { sortValue, id } = decodeCursor(input.cursor, { textSortValue: kind === 'text' });
  const after = direction === 'desc' ? 'lt' : 'gt';

  if (kind !== 'date') {
    return { OR: [{ [field]: { [after]: sortValue } }, { [field]: sortValue, [idField]: { [after]: id } }] };
  }

  const bucketStart = new Date(sortValue);
  const bucketEnd = new Date(bucketStart.getTime() + 1);
  // Both ends go to the database, so both must be dates it can take (an expanded year is not).
  if (typeof sortValue !== 'string' || !isStorableDate(bucketStart) || !isStorableDate(bucketEnd)) {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  const sameBucket = { [field]: { gte: bucketStart, lt: bucketEnd }, [idField]: { [after]: id } };
  const beyondBucket = direction === 'desc' ? { [field]: { lt: bucketStart } } : { [field]: { gte: bucketEnd } };
  return { OR: [beyondBucket, sameBucket] };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Turn a `take + 1` probe result into a page. When the probe row came back there is a
 * next page: it is dropped, and the cursor is built from the last row that IS returned.
 */
export function buildCursorPage<T>(rows: T[], take: number, toCursor: (row: T) => string): CursorPage<T> {
  if (rows.length <= take) return { items: rows, nextCursor: null };
  const items = rows.slice(0, take);
  return { items, nextCursor: toCursor(items[items.length - 1]) };
}

/**
 * A status pivot's numbers from one grouped count: `counts` has EVERY declared status (zero-filled — a pivot
 * never shows a missing label), `total` sums only the statuses in view (all of them when no status filter
 * applies). The grouped query runs over the list's scope WITHOUT the status filter, so the counts don't move
 * when the user changes pivot.
 */
export function pivotCounts<K extends string>(
  grouped: ReadonlyArray<{ key: K; count: number }>,
  statuses: readonly K[],
  inView?: readonly K[],
): { counts: Record<K, number>; total: number } {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<K, number>;
  for (const { key, count } of grouped) {
    if (key in counts) counts[key] = count;
  }
  const total = (inView ?? statuses).reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  return { counts, total };
}

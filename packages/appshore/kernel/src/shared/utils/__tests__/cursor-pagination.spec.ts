import { BadRequestException } from '@nestjs/common';
import {
  pivotCounts,
  DEFAULT_CURSOR_LIMIT,
  MAX_CURSOR_LIMIT,
  buildCursorPage,
  clampCursorLimit,
  decodeCursor,
  encodeCursor,
  keysetWhere,
} from '../cursor-pagination';

describe('cursor pagination', () => {
  describe('clampCursorLimit', () => {
    it('defaults when the limit is missing or not a number', () => {
      expect(clampCursorLimit()).toBe(DEFAULT_CURSOR_LIMIT);
      expect(clampCursorLimit(null)).toBe(DEFAULT_CURSOR_LIMIT);
      expect(clampCursorLimit('abc')).toBe(DEFAULT_CURSOR_LIMIT);
      expect(clampCursorLimit(Number.NaN)).toBe(DEFAULT_CURSOR_LIMIT);
    });

    it('treats a blank string as missing — `?limit=` must not page one row at a time', () => {
      expect(clampCursorLimit('')).toBe(DEFAULT_CURSOR_LIMIT);
      expect(clampCursorLimit('   ')).toBe(DEFAULT_CURSOR_LIMIT);
    });

    it('defaults for a repeated `?limit=` (an array at runtime)', () => {
      expect(clampCursorLimit(['10', '20'] as unknown as string)).toBe(DEFAULT_CURSOR_LIMIT);
    });

    it('clamps to 1..MAX and accepts the raw query string', () => {
      expect(clampCursorLimit(0)).toBe(1);
      expect(clampCursorLimit(-5)).toBe(1);
      expect(clampCursorLimit('25')).toBe(25);
      expect(clampCursorLimit(12.9)).toBe(12);
      expect(clampCursorLimit(10_000)).toBe(MAX_CURSOR_LIMIT);
    });
  });

  describe('encodeCursor / decodeCursor', () => {
    it('round-trips a date sort value as its ISO string', () => {
      const createdAt = new Date('2026-10-05T10:11:12.345Z');
      expect(decodeCursor(encodeCursor(createdAt, 'in_abc'))).toEqual({
        sortValue: '2026-10-05T10:11:12.345Z',
        id: 'in_abc',
      });
    });

    it('round-trips string and numeric sort values and ids', () => {
      expect(decodeCursor(encodeCursor('Alpha', 42))).toEqual({ sortValue: 'Alpha', id: 42 });
      expect(decodeCursor(encodeCursor(3, 'r_1'))).toEqual({ sortValue: 3, id: 'r_1' });
    });

    it('is URL-safe', () => {
      expect(encodeCursor('a?b/c+d==', 'x')).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it.each([
      ['not base64 json', 'not-a-cursor'],
      ['empty', ''],
      ['json that is not a pair', Buffer.from(JSON.stringify({ a: 1 })).toString('base64url')],
      ['a pair of the wrong length', Buffer.from(JSON.stringify([1, 2, 3])).toString('base64url')],
      ['a pair with a null part', Buffer.from(JSON.stringify([null, 1])).toString('base64url')],
      ['a pair with an object part', Buffer.from(JSON.stringify(['x', {}])).toString('base64url')],
      ['a repeated cursor param (an array)', ['a', 'b'] as unknown as string],
    ])('rejects %s with a 400', (_label, cursor) => {
      expect(() => decodeCursor(cursor)).toThrow(BadRequestException);
    });
  });

  describe('keysetWhere', () => {
    it('selects rows strictly after the cursor for an exact-value sort (desc)', () => {
      const cursor = encodeCursor(3, 'r_9');
      expect(keysetWhere({ field: 'rank', idField: 'publicId', direction: 'desc', kind: 'value', cursor })).toEqual({
        OR: [{ rank: { lt: 3 } }, { rank: 3, publicId: { lt: 'r_9' } }],
      });
    });

    it('flips the comparison for an ascending sort', () => {
      const cursor = encodeCursor('Beta', 7);
      expect(keysetWhere({ field: 'name', idField: 'id', direction: 'asc', kind: 'value', cursor })).toEqual({
        OR: [{ name: { gt: 'Beta' } }, { name: 'Beta', id: { gt: 7 } }],
      });
    });

    it('treats the cursor millisecond as a bucket for a date sort (desc)', () => {
      const at = new Date('2026-10-05T10:11:12.345Z');
      const cursor = encodeCursor(at, 'in_m');
      expect(keysetWhere({ field: 'createdAt', idField: 'publicId', direction: 'desc', kind: 'date', cursor })).toEqual(
        {
          OR: [
            { createdAt: { lt: at } },
            { createdAt: { gte: at, lt: new Date(at.getTime() + 1) }, publicId: { lt: 'in_m' } },
          ],
        },
      );
    });

    it('treats the cursor millisecond as a bucket for a date sort (asc)', () => {
      const at = new Date('2026-10-05T10:11:12.345Z');
      const next = new Date(at.getTime() + 1);
      const cursor = encodeCursor(at, 'in_m');
      expect(keysetWhere({ field: 'createdAt', idField: 'publicId', direction: 'asc', kind: 'date', cursor })).toEqual({
        OR: [{ createdAt: { gte: next } }, { createdAt: { gte: at, lt: next }, publicId: { gt: 'in_m' } }],
      });
    });

    it.each([
      ['an expanded year', encodeCursor('+275000-01-01T00:00:00.000Z', 'wi_x')],
      ['a negative expanded year', encodeCursor('-200000-01-01T00:00:00.000Z', 'wi_x')],
      ['a bucket that ends past year 9999', encodeCursor('9999-12-31T23:59:59.999Z', 'wi_x')],
    ])('rejects a date cursor with %s — a valid JS Date the database cannot take', (_label, cursor) => {
      expect(() =>
        keysetWhere({ field: 'createdAt', idField: 'publicId', direction: 'desc', kind: 'date', cursor }),
      ).toThrow(BadRequestException);
    });

    it.each([
      ['a NUL byte in the id', ['2026-10-01T00:00:00.000Z', 'wi_\u0000']],
      ['a control character in the sort value', ['HIGH|\u0001', 'wi_x']],
      ['an oversized part', ['2026-10-01T00:00:00.000Z', 'x'.repeat(301)]],
    ])('rejects a well-formed cursor with %s', (_label, parts) => {
      const cursor = Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
      expect(() => decodeCursor(cursor)).toThrow(BadRequestException);
    });

    it('reads a text sort value holding a tab or a newline — a stored name must not strand the list', () => {
      const base = { field: 'name', idField: 'publicId', direction: 'asc', kind: 'text' } as const;
      const name = 'Payments\tstandards\nv2';
      expect(keysetWhere({ ...base, cursor: encodeCursor(name, 'sp_b') })).toEqual({
        OR: [{ name: { gt: name } }, { name, publicId: { gt: 'sp_b' } }],
      });
      expect(decodeCursor(encodeCursor(name, 'sp_b'), { textSortValue: true })).toEqual({
        sortValue: name,
        id: 'sp_b',
      });
    });

    it.each([
      ['a NUL byte in the text', ['Hand\u0000book', 'sp_b']],
      ['a control character in the id', ['Handbook', 'sp\tb']],
      ['an oversized text', ['x'.repeat(301), 'sp_b']],
      ['a number where the text should be', [7, 'sp_b']],
    ])('still rejects a text cursor with %s', (_label, parts) => {
      const cursor = Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
      expect(() => keysetWhere({ field: 'name', idField: 'publicId', direction: 'asc', kind: 'text', cursor })).toThrow(
        BadRequestException,
      );
    });

    it('rejects a date cursor whose value is not a date with a 400', () => {
      const base = { field: 'createdAt', idField: 'publicId', direction: 'desc', kind: 'date' } as const;
      expect(() => keysetWhere({ ...base, cursor: encodeCursor('nope', 'in_m') })).toThrow(BadRequestException);
      expect(() => keysetWhere({ ...base, cursor: encodeCursor(12, 'in_m') })).toThrow(BadRequestException);
      expect(() => keysetWhere({ ...base, cursor: '%%%' })).toThrow(BadRequestException);
    });
  });

  describe('buildCursorPage', () => {
    const toCursor = (row: { id: number }) => `c${row.id}`;

    it('returns every row and no cursor when the probe row is absent', () => {
      const rows = [{ id: 1 }, { id: 2 }];
      expect(buildCursorPage(rows, 2, toCursor)).toEqual({ items: rows, nextCursor: null });
      expect(buildCursorPage([], 2, toCursor)).toEqual({ items: [], nextCursor: null });
    });

    it('drops the probe row and points the cursor at the last returned row', () => {
      expect(buildCursorPage([{ id: 1 }, { id: 2 }, { id: 3 }], 2, toCursor)).toEqual({
        items: [{ id: 1 }, { id: 2 }],
        nextCursor: 'c2',
      });
    });
  });

  /**
   * End to end over an in-memory table: the where fragment + ordering + page builder must
   * walk every row exactly once, including rows that share one timestamp.
   */
  describe('paging a list with tied sort values', () => {
    interface Row {
      publicId: string;
      createdAt: Date;
    }
    type Comparison = { lt?: unknown; gt?: unknown; gte?: unknown };

    const tied = new Date('2026-10-05T10:00:00.000Z');
    const table: Row[] = [
      { publicId: 'in_a', createdAt: new Date('2026-10-05T09:00:00.000Z') },
      { publicId: 'in_b', createdAt: tied },
      { publicId: 'in_c', createdAt: tied },
      { publicId: 'in_d', createdAt: tied },
      { publicId: 'in_e', createdAt: tied },
      { publicId: 'in_f', createdAt: new Date('2026-10-05T11:00:00.000Z') },
      { publicId: 'in_g', createdAt: new Date('2026-10-05T11:00:00.001Z') },
    ];

    function compare(a: unknown, b: unknown): number {
      const [x, y] = a instanceof Date && b instanceof Date ? [a.getTime(), b.getTime()] : [a, b];
      return (x as number | string) < (y as number | string)
        ? -1
        : (x as number | string) > (y as number | string)
          ? 1
          : 0;
    }

    function matches(row: Row, clause: Record<string, unknown>): boolean {
      return Object.entries(clause).every(([field, condition]) => {
        const value = row[field as keyof Row];
        if (condition instanceof Date || typeof condition !== 'object' || condition === null) {
          return compare(value, condition) === 0;
        }
        const { lt, gt, gte } = condition as Comparison;
        if (lt !== undefined && !(compare(value, lt) < 0)) return false;
        if (gt !== undefined && !(compare(value, gt) > 0)) return false;
        if (gte !== undefined && !(compare(value, gte) >= 0)) return false;
        return true;
      });
    }

    function walk(direction: 'asc' | 'desc', take: number): string[] {
      const sign = direction === 'desc' ? -1 : 1;
      const ordered = [...table].sort(
        (a, b) => sign * (compare(a.createdAt, b.createdAt) || compare(a.publicId, b.publicId)),
      );
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const where: { OR: Record<string, unknown>[] } | null = cursor
          ? (keysetWhere({ field: 'createdAt', idField: 'publicId', direction, kind: 'date', cursor }) as {
              OR: Record<string, unknown>[];
            })
          : null;
        const rows = ordered.filter((row) => !where || where.OR.some((clause) => matches(row, clause)));
        const page = buildCursorPage(rows.slice(0, take + 1), take, (row) => encodeCursor(row.createdAt, row.publicId));
        seen.push(...page.items.map((row) => row.publicId));
        cursor = page.nextCursor;
      } while (cursor);
      return seen;
    }

    it.each([1, 2, 3, 7, 50])('newest first, %i per page: every row once, in order', (take) => {
      expect(walk('desc', take)).toEqual(['in_g', 'in_f', 'in_e', 'in_d', 'in_c', 'in_b', 'in_a']);
    });

    it.each([1, 2, 3, 7, 50])('oldest first, %i per page: every row once, in order', (take) => {
      expect(walk('asc', take)).toEqual(['in_a', 'in_b', 'in_c', 'in_d', 'in_e', 'in_f', 'in_g']);
    });
  });
});

describe('pivotCounts', () => {
  const STATUSES = ['OPEN', 'PAID', 'VOID'] as const;

  it('zero-fills every key and sums the whole list when no status is in view', () => {
    const { counts, total } = pivotCounts([{ key: 'PAID', count: 3 }], STATUSES);
    expect(counts).toEqual({ OPEN: 0, PAID: 3, VOID: 0 });
    expect(total).toBe(3);
  });

  it('totals only the statuses in view, while counts keep every status', () => {
    const grouped = [
      { key: 'OPEN' as const, count: 2 },
      { key: 'PAID' as const, count: 5 },
      { key: 'VOID' as const, count: 1 },
    ];
    const { counts, total } = pivotCounts(grouped, STATUSES, ['OPEN', 'VOID']);
    expect(counts).toEqual({ OPEN: 2, PAID: 5, VOID: 1 });
    expect(total).toBe(3);
  });

  it('ignores a grouped key the list does not declare', () => {
    const { counts, total } = pivotCounts([{ key: 'LEGACY' as never, count: 9 }], STATUSES);
    expect(counts).toEqual({ OPEN: 0, PAID: 0, VOID: 0 });
    expect(total).toBe(0);
  });
});

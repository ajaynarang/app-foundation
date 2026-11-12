import { countInMemory, findManyInMemory } from './prisma-where';

type Row = Record<string, unknown>;

/**
 * A Prisma model delegate backed by a fixture: `findMany` and `count` read the rows through `prisma-where`, so a
 * list spec walks real pages (ties included) instead of asserting on the arguments it passed.
 */
export function fixtureModel<T extends Row>(rows: T[]) {
  return {
    findMany: jest.fn(async (args: Parameters<typeof findManyInMemory>[1] = {}) => findManyInMemory(rows, args)),
    count: jest.fn(async (args: { where?: Row } = {}) => countInMemory(rows, args)),
  };
}

/**
 * Timestamps for a list fixture: rows come in groups of `tieSize` that share one millisecond, newest first. A
 * page boundary that falls inside a group is the case a keyset tiebreak exists for.
 */
export function tiedTimestamps(count: number, tieSize = 3, start = Date.parse('2026-03-01T12:00:00.000Z')): Date[] {
  return Array.from({ length: count }, (_, index) => new Date(start - Math.floor(index / tieSize) * 60_000));
}

/** Follow `nextCursor` until the list ends. Fails loudly if a list never ends. */
export async function walkCursorList<T>(
  read: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
  maxPages = 100,
): Promise<{ pages: T[][]; items: T[] }> {
  const pages: T[][] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await read(cursor);
    pages.push(result.items);
    if (result.nextCursor === null) return { pages, items: pages.flat() };
    cursor = result.nextCursor;
  }
  throw new Error(`walkCursorList: the list did not end within ${maxPages} pages`);
}

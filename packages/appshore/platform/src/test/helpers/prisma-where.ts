/**
 * A tiny in-memory reading of the Prisma `where` / `orderBy` / `take` subset the cursor-paged
 * lists use — so a list spec can walk real pages over a fixture (ties included) instead of
 * asserting on the arguments it passed. Supported: `AND`, `OR`, `NOT`, equality, `in`, `notIn`,
 * `lt` / `lte` / `gt` / `gte`, `not`, `contains` (with `mode: 'insensitive'`) and nested relation
 * objects (`{ subscription: { tenantId: 1 } }`). Anything else throws, so a spec never passes by
 * silently ignoring a clause.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const OPERATORS = new Set(['equals', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'not', 'contains', 'mode']);

function comparable(value: unknown): number | string | null {
  if (value instanceof Date) return value.getTime();
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  // Prisma.Decimal and friends
  return Number(String(value));
}

function compare(a: unknown, b: unknown): number {
  const left = comparable(a);
  const right = comparable(b);
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left < right ? -1 : 1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => OPERATORS.has(key));
}

function matchesField(actual: unknown, condition: unknown): boolean {
  if (!isPlainObject(condition)) return compare(actual, condition) === 0;
  const insensitive = condition.mode === 'insensitive';
  return Object.entries(condition).every(([op, expected]) => {
    switch (op) {
      case 'mode':
        return true;
      case 'equals':
        return compare(actual, expected) === 0;
      case 'in':
        return (expected as unknown[]).some((value) => compare(actual, value) === 0);
      case 'notIn':
        return !(expected as unknown[]).some((value) => compare(actual, value) === 0);
      case 'lt':
        return actual != null && compare(actual, expected) < 0;
      case 'lte':
        return actual != null && compare(actual, expected) <= 0;
      case 'gt':
        return actual != null && compare(actual, expected) > 0;
      case 'gte':
        return actual != null && compare(actual, expected) >= 0;
      case 'not':
        return !matchesField(actual, expected);
      case 'contains': {
        if (typeof actual !== 'string') return false;
        const needle = String(expected).replace(/\\([\\%_])/g, '$1');
        return insensitive ? actual.toLowerCase().includes(needle.toLowerCase()) : actual.includes(needle);
      }
      default:
        throw new Error(`prisma-where: unsupported operator "${op}"`);
    }
  });
}

/** Does `row` satisfy the Prisma `where`? */
export function matchesWhere(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === 'AND') return (condition as Where[]).every((part) => matchesWhere(row, part));
    if (key === 'OR') return (condition as Where[]).some((part) => matchesWhere(row, part));
    if (key === 'NOT') {
      const parts = Array.isArray(condition) ? (condition as Where[]) : [condition as Where];
      return parts.every((part) => !matchesWhere(row, part));
    }
    const actual = row[key];
    // A nested relation filter (`{ subscription: { tenantId: 1 } }`) reads the embedded object.
    if (isPlainObject(condition) && !isOperatorObject(condition) && isPlainObject(actual)) {
      return matchesWhere(actual as Row, condition as Where);
    }
    return matchesField(actual, condition);
  });
}

type OrderBy = Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;

/** Rows matching `where`, sorted by `orderBy`, cut to `take` — a `findMany` for a fixture. */
export function findManyInMemory<T extends Row>(rows: T[], args: { where?: Where; orderBy?: OrderBy; take?: number }) {
  const order = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
  const sorted = rows
    .filter((row) => matchesWhere(row, args.where))
    .sort((a, b) => {
      for (const clause of order) {
        const [field, direction] = Object.entries(clause)[0];
        const result = compare(a[field], b[field]);
        if (result !== 0) return direction === 'desc' ? -result : result;
      }
      return 0;
    });
  return args.take === undefined ? sorted : sorted.slice(0, args.take);
}

/** `count({ where })` over a fixture. */
export function countInMemory(rows: Row[], args: { where?: Where }): number {
  return rows.filter((row) => matchesWhere(row, args.where)).length;
}

/** `groupBy({ by: [field], where, _count: { _all: true } })` over a fixture. */
export function groupCountInMemory(rows: Row[], args: { by: string[]; where?: Where }) {
  const field = args.by[0];
  const counts = new Map<unknown, number>();
  for (const row of rows.filter((candidate) => matchesWhere(candidate, args.where))) {
    counts.set(row[field], (counts.get(row[field]) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ [field]: value, _count: { _all: count } }));
}

/**
 * `groupBy({ by, where, _max, _count: { _all: true } })` over a fixture: groups by every `by` field (in first-seen
 * order), and adds `_max` (per requested field, null when every value is null) and `_count._all` only when asked —
 * as Prisma does.
 */
export function groupByInMemory(
  rows: Row[],
  args: { by: string[]; where?: Where; _max?: Record<string, true>; _count?: { _all: true } },
): Row[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows.filter((candidate) => matchesWhere(candidate, args.where))) {
    const key = JSON.stringify(args.by.map((field) => comparable(row[field])));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((members) => {
    const group: Row = Object.fromEntries(args.by.map((field) => [field, members[0][field]]));
    if (args._max) {
      group._max = Object.fromEntries(
        Object.keys(args._max).map((field) => [field, maxOf(members.map((member) => member[field]))]),
      );
    }
    if (args._count) group._count = { _all: members.length };
    return group;
  });
}

function maxOf(values: unknown[]): unknown {
  return values
    .filter((value) => value !== null && value !== undefined)
    .reduce<unknown>((best, value) => (best === null || compare(value, best) > 0 ? value : best), null);
}

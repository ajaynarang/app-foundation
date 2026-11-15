import { countInMemory, findManyInMemory, groupByInMemory, groupCountInMemory, matchesWhere } from '../prisma-where';

const at = (iso: string) => new Date(iso);
const rows = [
  {
    id: 'a',
    status: 'PAID',
    name: 'Acme_Co',
    createdAt: at('2026-01-01T00:00:00Z'),
    deliveredAt: null,
    sub: { tenantId: 1 },
  },
  {
    id: 'b',
    status: 'OPEN',
    name: 'Beta',
    createdAt: at('2026-01-02T00:00:00Z'),
    deliveredAt: at('2026-01-02T00:00:01Z'),
    sub: { tenantId: 1 },
  },
  {
    id: 'c',
    status: 'PAID',
    name: 'Gamma',
    createdAt: at('2026-01-02T00:00:00Z'),
    deliveredAt: null,
    sub: { tenantId: 2 },
  },
];

describe('prisma-where (in-memory list fixture)', () => {
  it('reads equality, in / notIn, ranges, not, AND / OR / NOT and nested relations', () => {
    expect(matchesWhere(rows[0], { status: 'PAID' })).toBe(true);
    expect(matchesWhere(rows[1], { status: { in: ['PAID'] } })).toBe(false);
    expect(matchesWhere(rows[1], { status: { notIn: ['PAID'] } })).toBe(true);
    expect(
      matchesWhere(rows[1], { createdAt: { gte: at('2026-01-02T00:00:00Z'), lt: at('2026-01-03T00:00:00Z') } }),
    ).toBe(true);
    expect(matchesWhere(rows[0], { createdAt: { gt: at('2026-01-01T00:00:00Z') } })).toBe(false);
    expect(matchesWhere(rows[0], { createdAt: { lte: at('2026-01-01T00:00:00Z') } })).toBe(true);
    expect(matchesWhere(rows[0], { deliveredAt: { not: null } })).toBe(false);
    expect(matchesWhere(rows[1], { deliveredAt: { not: null } })).toBe(true);
    expect(matchesWhere(rows[0], { deliveredAt: null })).toBe(true);
    expect(matchesWhere(rows[0], { AND: [{ status: 'PAID' }, { OR: [{ id: 'x' }, { id: 'a' }] }] })).toBe(true);
    expect(matchesWhere(rows[0], { NOT: { status: 'PAID' } })).toBe(false);
    expect(matchesWhere(rows[0], { NOT: [{ status: 'OPEN' }] })).toBe(true);
    expect(matchesWhere(rows[2], { sub: { tenantId: 1 } })).toBe(false);
    expect(matchesWhere(rows[0], { status: { equals: 'PAID' }, name: undefined })).toBe(true);
    expect(matchesWhere(rows[0], undefined)).toBe(true);
  });

  it('reads contains literally (escaped wildcards) and case-insensitively', () => {
    expect(matchesWhere(rows[0], { name: { contains: 'acme\\_', mode: 'insensitive' } })).toBe(true);
    expect(matchesWhere(rows[1], { name: { contains: 'BETA' } })).toBe(false);
    expect(matchesWhere(rows[1], { createdAt: { contains: 'x' } })).toBe(false);
  });

  it('throws on an operator it does not know, so a spec never passes by ignoring a clause', () => {
    expect(() => matchesWhere(rows[0], { name: { startsWith: 'A' } as never })).toThrow('unsupported');
  });

  it('sorts by every orderBy clause, then takes', () => {
    const page = findManyInMemory(rows, { orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 2 });
    expect(page.map((row) => row.id)).toEqual(['b', 'c']);
    expect(findManyInMemory(rows, { orderBy: { name: 'asc' } }).map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(findManyInMemory(rows, {}).length).toBe(3);
  });

  it('counts and groups', () => {
    expect(countInMemory(rows, { where: { status: 'PAID' } })).toBe(2);
    expect(groupCountInMemory(rows, { by: ['status'], where: { sub: { tenantId: 1 } } })).toEqual([
      { status: 'PAID', _count: { _all: 1 } },
      { status: 'OPEN', _count: { _all: 1 } },
    ]);
  });

  it('groups by several keys and computes _max and _count', () => {
    const reads = [
      { setId: 11, prNumber: 1, readAt: at('2026-01-01T11:00:00Z'), sequence: 2 },
      { setId: 12, prNumber: 1, readAt: at('2026-01-01T10:00:00Z'), sequence: 5 },
      { setId: 12, prNumber: 1, readAt: at('2026-01-01T12:00:00Z'), sequence: 3 },
      { setId: 12, prNumber: 2, readAt: at('2026-01-01T09:00:00Z'), sequence: null },
      { setId: 13, prNumber: 1, readAt: at('2026-01-01T13:00:00Z'), sequence: 9 },
    ];
    expect(
      groupByInMemory(reads, {
        by: ['setId', 'prNumber'],
        where: { OR: [{ setId: { in: [11, 12] } }] },
        _max: { readAt: true, sequence: true },
        _count: { _all: true },
      }),
    ).toEqual([
      { setId: 11, prNumber: 1, _max: { readAt: at('2026-01-01T11:00:00Z'), sequence: 2 }, _count: { _all: 1 } },
      { setId: 12, prNumber: 1, _max: { readAt: at('2026-01-01T12:00:00Z'), sequence: 5 }, _count: { _all: 2 } },
      { setId: 12, prNumber: 2, _max: { readAt: at('2026-01-01T09:00:00Z'), sequence: null }, _count: { _all: 1 } },
    ]);
    expect(groupByInMemory(reads, { by: ['setId'], where: { setId: 13 }, _max: { readAt: true } })).toEqual([
      { setId: 13, _max: { readAt: at('2026-01-01T13:00:00Z') } },
    ]);
    expect(groupByInMemory(reads, { by: ['setId'], where: { setId: 99 }, _count: { _all: true } })).toEqual([]);
  });
});

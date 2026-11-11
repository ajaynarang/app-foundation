import { Test } from '@nestjs/testing';

import { AdminAiSpendService } from '../admin-ai-spend.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';

describe('AdminAiSpendService', () => {
  let service: AdminAiSpendService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      aiInvocation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      tenantAiBudget: {
        upsert: jest.fn().mockResolvedValue({
          dailySoftUsd: { toString: () => '5' },
          dailyHardUsd: { toString: () => '20' },
          monthlySoftUsd: { toString: () => '50' },
          monthlyHardUsd: { toString: () => '200' },
          notes: null,
        }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [AdminAiSpendService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminAiSpendService);
  });

  describe('listTenants: a cursor list, highest spend first', () => {
    const totalsRow = (id: number, slug: string, cost: string) => ({
      tenant_id: id,
      tenant_slug: slug,
      company_name: `${slug} Inc`,
      total_cost_usd: cost,
      call_count: 15n,
      error_count: 1n,
    });
    /** The text and the bound values of the nth `$queryRaw` call. */
    const sqlOf = (call: number) => {
      const [strings, ...values] = prisma.$queryRaw.mock.calls[call];
      const flatten = (part: any): { text: string; values: unknown[] } =>
        part && typeof part === 'object' && Array.isArray(part.strings)
          ? { text: part.strings.join('?'), values: part.values }
          : { text: '?', values: [part] };
      const parts = values.map(flatten);
      return {
        text: (strings as string[]).reduce((acc, str, i) => acc + str + (parts[i]?.text ?? ''), ''),
        values: parts.flatMap((part) => part.values),
      };
    };

    it('returns the page with totals, a sparkline and last activity read for its tenants only', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([totalsRow(1, 'acme', '3.750000')])
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          { tenant_id: 1, day: new Date('2026-05-26T00:00:00Z'), total_cost_usd: '1.500000' },
          { tenant_id: 1, day: new Date('2026-05-27T00:00:00Z'), total_cost_usd: '2.250000' },
        ])
        .mockResolvedValueOnce([{ tenant_id: 1, last_at: new Date('2026-05-27T12:00:00Z') }]);

      const result = await service.listTenants({ days: 7 });

      expect(result.total).toBe(1);
      expect(result.nextCursor).toBeNull();
      expect(result.items).toEqual([
        {
          tenantId: 1,
          tenantSlug: 'acme',
          companyName: 'acme Inc',
          windowCostUsd: '3.750000',
          windowCallCount: 15,
          windowErrorCount: 1,
          sparkline: [
            { day: '2026-05-26', costUsd: '1.500000' },
            { day: '2026-05-27', costUsd: '2.250000' },
          ],
          lastActivityAt: '2026-05-27T12:00:00.000Z',
        },
      ]);
    });

    it('orders by spend then the tenant public id in SQL, and reads one probe row past the page', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n }]);

      await service.listTenants({ days: 7, limit: 2 });

      const page = sqlOf(0);
      expect(page.text).toContain('ORDER BY totals.cost DESC, t.tenant_id ASC');
      expect(page.values[page.values.length - 1]).toBe(3);
    });

    it('hands out a cursor when a probe row came back, and the next page starts strictly after it', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          totalsRow(2, 'big', '50.000000'),
          totalsRow(1, 'mid', '5.000000'),
          totalsRow(3, 'mid-b', '5.000000'),
        ])
        .mockResolvedValueOnce([{ total: 3n }])
        .mockResolvedValue([]);
      const first = await service.listTenants({ days: 7, limit: 2 });

      expect(first.items.map((row) => row.tenantSlug)).toEqual(['big', 'mid']);
      expect(first.total).toBe(3);
      expect(first.nextCursor).not.toBeNull();

      prisma.$queryRaw.mockReset();
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 3n }]);
      await service.listTenants({ days: 7, limit: 2, cursor: first.nextCursor! });

      // Same cost, a larger public id: the tie is split by the tenant's public id, never its Int key.
      const page = sqlOf(0);
      expect(page.text).toContain('totals.cost < ?::numeric OR (totals.cost = ?::numeric AND t.tenant_id > ?)');
      expect(page.values).toEqual(expect.arrayContaining(['5.000000', 'mid']));
      // The total ignores the cursor.
      expect(sqlOf(1).text).not.toContain('totals.cost <');
    });

    it('searches company name and tenant id with LIKE wildcards escaped', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n }]);
      await service.listTenants({ days: 7, q: '50%_off' });
      expect(sqlOf(0).values).toEqual(expect.arrayContaining(['%50\\%\\_off%']));
    });

    it('answers 400 on a cursor from another window, or one it did not issue, before any query runs', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([totalsRow(2, 'big', '50.000000'), totalsRow(1, 'small', '5.000000')])
        .mockResolvedValueOnce([{ total: 2n }])
        .mockResolvedValue([]);
      const sevenDay = await service.listTenants({ days: 7, limit: 1 });
      prisma.$queryRaw.mockClear();

      await expect(service.listTenants({ days: 30, cursor: sevenDay.nextCursor! })).rejects.toMatchObject({
        status: 400,
      });
      await expect(service.listTenants({ days: 7, cursor: 'not-a-cursor' })).rejects.toMatchObject({ status: 400 });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns null lastActivityAt when no invocations exist for a tenant', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([totalsRow(9, 't9', '0.000000')])
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]); // no last-activity rows

      const result = await service.listTenants({ days: 7 });
      expect(result.items[0].lastActivityAt).toBeNull();
    });
  });

  describe('getSummary', () => {
    it('sums the window across every tenant in SQL, so the figure never depends on the pages loaded', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ total_cost_usd: '53.750000', tenant_count: 2n }]);

      expect(await service.getSummary({ days: 7 })).toEqual({ windowCostUsd: '53.750000', tenantCount: 2 });
      expect(prisma.$queryRaw.mock.calls[0][0].join('?')).toContain('COUNT(DISTINCT tenant_id)');
    });

    it('answers zero, not null, for a window with no spend', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ total_cost_usd: null, tenant_count: 0n }]);
      expect(await service.getSummary({ days: 7 })).toEqual({ windowCostUsd: '0.000000', tenantCount: 0 });
    });
  });

  describe('listSurfaceBreakdown', () => {
    it('maps view rows to surface rows', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          surface: 'DESK_STEP',
          total_cost_usd: '4.000000',
          call_count: 40n,
          error_count: 2n,
          total_tokens: 120000n,
        },
      ]);

      const result = await service.listSurfaceBreakdown({ tenantId: 1, days: 7 });

      expect(result).toEqual([
        {
          surface: 'DESK_STEP',
          windowCostUsd: '4.000000',
          windowCallCount: 40,
          windowErrorCount: 2,
          windowTotalTokens: 120000,
        },
      ]);
    });
  });

  describe('listInvocations', () => {
    function makeRow(overrides: Record<string, unknown> = {}) {
      return {
        id: '01900000-0000-7000-8000-000000000001',
        surface: 'DOC_RATECON',
        agentId: 'ratecon-parser',
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
        costUsd: { toString: () => '0.010500' },
        promptTokens: 1000,
        completionTokens: 500,
        cachedTokens: null,
        latencyMs: 1234,
        status: 'OK',
        langfuseTraceId: 'lf-1',
        linkRefType: 'document',
        linkRefId: 'doc-1',
        createdAt: new Date('2026-05-27T10:00:00Z'),
        ...overrides,
      };
    }

    it('returns items and a null cursor when fewer than the limit', async () => {
      prisma.aiInvocation.findMany.mockResolvedValue([makeRow()]);
      prisma.aiInvocation.count.mockResolvedValue(1);

      const result = await service.listInvocations({ tenantId: 1, limit: 50 });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].costUsd).toBe('0.010500');
      expect(result.nextCursor).toBeNull();
    });

    it('peeks one extra row to compute a next cursor', async () => {
      // limit 1, returns 2 → hasMore
      prisma.aiInvocation.findMany.mockResolvedValue([makeRow({ id: 'aaa' }), makeRow({ id: 'bbb' })]);

      const result = await service.listInvocations({ tenantId: 1, limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).not.toBeNull();
      // findMany asked for limit+1
      expect(prisma.aiInvocation.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    });

    it('round-trips a cursor back into a keyset where clause', async () => {
      // Return 2 rows for a limit-1 request → hasMore → a non-null cursor.
      prisma.aiInvocation.findMany.mockResolvedValue([makeRow({ id: 'ccc' }), makeRow({ id: 'ddd' })]);
      const first = await service.listInvocations({ tenantId: 1, limit: 1 });
      expect(first.nextCursor).not.toBeNull();

      prisma.aiInvocation.findMany.mockClear();
      prisma.aiInvocation.findMany.mockResolvedValue([]);

      await service.listInvocations({ tenantId: 1, limit: 1, cursor: first.nextCursor ?? undefined });

      const call = prisma.aiInvocation.findMany.mock.calls[0][0];
      const [scope, keyset] = call.where.AND;
      expect(scope).toEqual({ tenantId: 1 });
      expect(keyset.OR[0]).toHaveProperty('createdAt');
      // The total is counted over the scope alone, never the cursor.
      expect(prisma.aiInvocation.count).toHaveBeenLastCalledWith({ where: { tenantId: 1 } });
    });

    it('walks every invocation once across pages, same-millisecond rows included', async () => {
      const stamps = tiedTimestamps(7);
      const rows = stamps.map((createdAt, index) =>
        makeRow({ id: `01900000-0000-7000-8000-00000000000${(index * 3) % 7}`, tenantId: 1, createdAt }),
      );
      Object.assign(prisma.aiInvocation, fixtureModel(rows));

      const { pages, items } = await walkCursorList((cursor) =>
        service.listInvocations({ tenantId: 1, limit: 2, cursor }),
      );

      expect(pages.map((page) => page.length)).toEqual([2, 2, 2, 1]);
      expect(new Set(items.map((item) => item.id)).size).toBe(7);
      const times = items.map((item) => Date.parse(item.createdAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('answers 400 on a cursor it did not issue, before any query runs', async () => {
      await expect(service.listInvocations({ tenantId: 1, cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
      expect(prisma.aiInvocation.findMany).not.toHaveBeenCalled();
    });

    it('applies the surface filter when provided', async () => {
      await service.listInvocations({ tenantId: 1, limit: 50, surface: 'DESK_STEP' });
      const call = prisma.aiInvocation.findMany.mock.calls[0][0];
      expect(call.where.surface).toBe('DESK_STEP');
    });

    it('clamps limit to 100', async () => {
      await service.listInvocations({ tenantId: 1, limit: 9999 });
      const call = prisma.aiInvocation.findMany.mock.calls[0][0];
      expect(call.take).toBe(101); // 100 + 1 peek
    });
  });

  describe('getBudget', () => {
    it('upserts (getOrCreate) and serializes Decimal caps to strings', async () => {
      const budget = await service.getBudget(7);
      expect(prisma.tenantAiBudget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 7 }, create: { tenantId: 7 }, update: {} }),
      );
      expect(budget).toEqual({
        dailySoftUsd: '5',
        dailyHardUsd: '20',
        monthlySoftUsd: '50',
        monthlyHardUsd: '200',
        notes: null,
      });
    });
  });

  describe('updateBudget', () => {
    it('persists the new caps via upsert', async () => {
      await service.updateBudget(7, {
        dailySoftUsd: 10,
        dailyHardUsd: 40,
        monthlySoftUsd: 100,
        monthlyHardUsd: 400,
        notes: 'raised for enterprise pilot',
      });
      const call = prisma.tenantAiBudget.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ tenantId: 7 });
      expect(call.update).toMatchObject({
        dailySoftUsd: 10,
        dailyHardUsd: 40,
        monthlySoftUsd: 100,
        monthlyHardUsd: 400,
        notes: 'raised for enterprise pilot',
      });
    });
  });

  describe('getCostVsQuota', () => {
    it('returns cost from the ledger, the budget, and an empty quota array', async () => {
      prisma.$queryRaw.mockResolvedValue([{ total_usd: '3.500000', call_count: 12n }]);
      const result = await service.getCostVsQuota({ tenantId: 7, days: 30 });
      expect(result.windowDays).toBe(30);
      expect(result.cost).toEqual({ totalUsd: '3.500000', callCount: 12 });
      expect(result.budget.dailyHardUsd).toBe('20');
      expect(result.quota).toEqual([]); // quota read API is a follow-up
    });
  });
});

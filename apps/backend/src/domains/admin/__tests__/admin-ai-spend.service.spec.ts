import { Test } from '@nestjs/testing';

import { AdminAiSpendService } from '../admin-ai-spend.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

describe('AdminAiSpendService', () => {
  let service: AdminAiSpendService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      aiInvocation: {
        findMany: jest.fn().mockResolvedValue([]),
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

  describe('listTenantSummaries', () => {
    it('aggregates daily slices into per-tenant totals with a sparkline', async () => {
      // First $queryRaw call = daily slices; second = last-activity.
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            tenant_id: 1,
            tenant_slug: 'acme',
            company_name: 'Acme Freight',
            day: new Date('2026-05-26T00:00:00Z'),
            total_cost_usd: '1.500000',
            call_count: 10n,
            error_count: 1n,
          },
          {
            tenant_id: 1,
            tenant_slug: 'acme',
            company_name: 'Acme Freight',
            day: new Date('2026-05-27T00:00:00Z'),
            total_cost_usd: '2.250000',
            call_count: 5n,
            error_count: 0n,
          },
        ])
        .mockResolvedValueOnce([{ tenant_id: 1, last_at: new Date('2026-05-27T12:00:00Z') }]);

      const result = await service.listTenantSummaries({ days: 7 });

      expect(result).toHaveLength(1);
      const row = result[0];
      expect(row.tenantId).toBe(1);
      expect(row.tenantSlug).toBe('acme');
      expect(row.companyName).toBe('Acme Freight');
      expect(row.windowCostUsd).toBe('3.750000'); // 1.5 + 2.25
      expect(row.windowCallCount).toBe(15);
      expect(row.windowErrorCount).toBe(1);
      expect(row.sparkline).toEqual([
        { day: '2026-05-26', costUsd: '1.500000' },
        { day: '2026-05-27', costUsd: '2.250000' },
      ]);
      expect(row.lastActivityAt).toBe('2026-05-27T12:00:00.000Z');
    });

    it('sorts tenants by spend descending', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            tenant_id: 1,
            tenant_slug: 'small',
            company_name: 'Small Co',
            day: new Date('2026-05-27T00:00:00Z'),
            total_cost_usd: '0.500000',
            call_count: 1n,
            error_count: 0n,
          },
          {
            tenant_id: 2,
            tenant_slug: 'big',
            company_name: 'Big Co',
            day: new Date('2026-05-27T00:00:00Z'),
            total_cost_usd: '50.000000',
            call_count: 100n,
            error_count: 0n,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.listTenantSummaries({ days: 7 });

      expect(result.map((r) => r.tenantSlug)).toEqual(['big', 'small']);
    });

    it('returns null lastActivityAt when no invocations exist for a tenant', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            tenant_id: 9,
            tenant_slug: 't9',
            company_name: 'T9',
            day: new Date('2026-05-27T00:00:00Z'),
            total_cost_usd: '0.000000',
            call_count: 0n,
            error_count: 0n,
          },
        ])
        .mockResolvedValueOnce([]); // no last-activity rows

      const result = await service.listTenantSummaries({ days: 7 });
      expect(result[0].lastActivityAt).toBeNull();
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

      const result = await service.listInvocations({ tenantId: 1, limit: 50 });

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
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR[0]).toHaveProperty('createdAt');
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

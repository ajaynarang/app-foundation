import { Test, TestingModule } from '@nestjs/testing';
import { ProfitabilityService } from '../profitability.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { createMockPrisma, createMockCache } from '../../../../../test/mocks';
import { makeDeliveredLoad } from '../../../../../test/factories';

describe('ProfitabilityService', () => {
  let service: ProfitabilityService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = createMockCache();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfitabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<ProfitabilityService>(ProfitabilityService);
  });

  const tenantId = 1;

  // ─── calculateForLoad ───────────────────────────────────────

  describe('calculateForLoad', () => {
    it('should calculate profitability with invoice revenue, driver cost, and fuel cost', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'LD-1001',
        rateCents: 300000,
        invoices: [{ totalCents: 350000 }],
        settlementLineItems: [{ payAmountCents: 80000 }],
        routePlanLoads: [{ plan: { totalDistanceMiles: 800 } }],
      });
      prisma.load.findFirst.mockResolvedValue(load);

      const result = await service.calculateForLoad(tenantId, 'ld-001');
      // Revenue from invoice (350000), not rateCents
      expect(result.revenueCents).toBe(350000);
      expect(result.driverCostCents).toBe(80000);
      // Fuel: 800 / 6.5 * 350 = round(43076.9) = 43077
      expect(result.fuelCostCents).toBe(Math.round((800 / 6.5) * 350));
      // Margin = 350000 - 80000 - 43077 = 226923
      const expectedFuel = Math.round((800 / 6.5) * 350);
      const expectedMargin = 350000 - 80000 - expectedFuel;
      expect(result.marginCents).toBe(expectedMargin);
      expect(result.marginPercent).toBeGreaterThan(0);
    });

    it('should use rateCents when no invoice exists', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'LD-1001',
        rateCents: 250000,
        invoices: [],
        settlementLineItems: [],
        routePlanLoads: [],
      });
      prisma.load.findFirst.mockResolvedValue(load);

      const result = await service.calculateForLoad(tenantId, 'ld-001');

      expect(result.revenueCents).toBe(250000);
    });

    it('should return empty profitability when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      const result = await service.calculateForLoad(tenantId, 'nonexistent');

      expect(result.revenueCents).toBe(0);
      expect(result.driverCostCents).toBe(0);
      expect(result.fuelCostCents).toBe(0);
      expect(result.marginCents).toBe(0);
      expect(result.marginPercent).toBe(0);
    });

    it('should handle zero revenue gracefully (no division by zero)', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'LD-1001',
        rateCents: 0,
        invoices: [],
        settlementLineItems: [],
        routePlanLoads: [],
      });
      prisma.load.findFirst.mockResolvedValue(load);

      const result = await service.calculateForLoad(tenantId, 'ld-001');

      expect(result.marginPercent).toBe(0);
    });

    it('should skip fuel cost when no route miles', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'LD-1001',
        rateCents: 200000,
        invoices: [],
        settlementLineItems: [{ payAmountCents: 50000 }],
        routePlanLoads: [],
      });
      prisma.load.findFirst.mockResolvedValue(load);

      const result = await service.calculateForLoad(tenantId, 'ld-001');

      expect(result.fuelCostCents).toBe(0);
      expect(result.marginCents).toBe(150000); // 200000 - 50000 - 0
    });

    it('should sum multiple settlement line items for driver cost', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'LD-1001',
        rateCents: 500000,
        invoices: [],
        settlementLineItems: [{ payAmountCents: 40000 }, { payAmountCents: 20000 }],
        routePlanLoads: [],
      });
      prisma.load.findFirst.mockResolvedValue(load);

      const result = await service.calculateForLoad(tenantId, 'ld-001');

      expect(result.driverCostCents).toBe(60000);
    });
  });

  // ─── calculateForTenant ─────────────────────────────────────

  describe('calculateForTenant', () => {
    it('should calculate profitability for all delivered loads', async () => {
      prisma.load.findMany.mockResolvedValue([
        makeDeliveredLoad({
          loadNumber: 'LD-1',
          rateCents: 200000,
          invoices: [],
          settlementLineItems: [{ payAmountCents: 50000 }],
          routePlanLoads: [{ plan: { totalDistanceMiles: 400 } }],
        }),
        makeDeliveredLoad({
          loadNumber: 'LD-2',
          rateCents: 300000,
          invoices: [{ totalCents: 310000 }],
          settlementLineItems: [],
          routePlanLoads: [],
        }),
      ]);

      const result = await service.calculateForTenant(tenantId);

      expect(result).toHaveLength(2);
      // Second load has no fuel cost (no route miles) and no driver cost
      expect(result[1].revenueCents).toBe(310000);
      expect(result[1].fuelCostCents).toBe(0);
      expect(result[1].driverCostCents).toBe(0);
      expect(result[1].marginCents).toBe(310000);
    });

    it('should respect limit parameter', async () => {
      prisma.load.findMany.mockResolvedValue([]);

      await service.calculateForTenant(tenantId, 10);

      expect(prisma.load.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });

    it('should calculate margin percent correctly', async () => {
      prisma.load.findMany.mockResolvedValue([
        makeDeliveredLoad({
          loadNumber: 'LD-1',
          rateCents: 100000,
          invoices: [],
          settlementLineItems: [{ payAmountCents: 30000 }],
          routePlanLoads: [],
        }),
      ]);

      const result = await service.calculateForTenant(tenantId);

      // margin = 100000 - 30000 = 70000, marginPercent = 70%
      expect(result[0].marginCents).toBe(70000);
      expect(result[0].marginPercent).toBe(70);
    });
  });
});

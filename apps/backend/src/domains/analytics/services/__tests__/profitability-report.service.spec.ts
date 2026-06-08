import { Test, TestingModule } from '@nestjs/testing';
import { ProfitabilityReportService } from '../profitability-report.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';

const mockPrisma = {
  fleetOperationsSettings: { findUnique: jest.fn() },
  load: { findMany: jest.fn() },
};

const mockCache = {
  getOrSet: jest.fn((_key, factory) => factory()),
};

describe('ProfitabilityReportService', () => {
  let service: ProfitabilityReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfitabilityReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SallyCacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<ProfitabilityReportService>(ProfitabilityReportService);
  });

  describe('getProfitabilityTrend', () => {
    it('should calculate margin correctly', async () => {
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      mockPrisma.load.findMany.mockResolvedValue([
        {
          deliveredAt: new Date('2025-01-15'),
          rateCents: 200000,
          invoices: [{ totalCents: 200000 }],
          settlementLineItems: [{ payAmountCents: 100000 }],
          routePlanLoads: [{ plan: { totalDistanceMiles: 500 } }],
        },
      ]);

      const result = await service.getProfitabilityTrend(
        1,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        'month' as any,
      );

      expect(result.totalRevenueCents).toBe(200000);
      expect(result.totalCostsCents).toBeGreaterThan(100000); // driver + fuel
      expect(result.overallMarginPercent).toBeLessThan(100);
      expect(result.periods).toHaveLength(1);
    });

    it('should handle zero revenue', async () => {
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      mockPrisma.load.findMany.mockResolvedValue([]);

      const result = await service.getProfitabilityTrend(1, new Date(), new Date(), 'month' as any);

      expect(result.overallMarginPercent).toBe(0);
    });
  });

  describe('getProfitabilityByLoad', () => {
    it('should return per-load profitability', async () => {
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      mockPrisma.load.findMany.mockResolvedValue([
        {
          loadNumber: 'LN-001',
          deliveredAt: new Date('2025-01-15'),
          rateCents: 150000,
          customer: { companyName: 'Acme' },
          invoices: [{ totalCents: 155000 }],
          settlementLineItems: [{ payAmountCents: 80000 }],
          routePlanLoads: [{ plan: { totalDistanceMiles: 300 } }],
        },
      ]);

      const result = await service.getProfitabilityByLoad(1, new Date(), new Date(), 50);

      expect(result).toHaveLength(1);
      expect(result[0].revenueCents).toBe(155000);
      expect(result[0].driverCostCents).toBe(80000);
      expect(result[0].marginCents).toBeLessThan(155000);
    });
  });
});

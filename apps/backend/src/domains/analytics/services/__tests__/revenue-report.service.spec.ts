import { Test, TestingModule } from '@nestjs/testing';
import { RevenueReportService } from '../revenue-report.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  load: { findMany: jest.fn() },
};

describe('RevenueReportService', () => {
  let service: RevenueReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RevenueReportService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<RevenueReportService>(RevenueReportService);
  });

  describe('getRevenueSummary', () => {
    it('should compute revenue totals and group by period', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          rateCents: 150000,
          deliveredAt: new Date('2025-01-15'),
          estimatedMiles: 500,
          actualMiles: 510,
          invoices: [{ totalCents: 155000 }],
        },
        {
          rateCents: 200000,
          deliveredAt: new Date('2025-01-20'),
          estimatedMiles: 800,
          actualMiles: null,
          invoices: [],
        },
      ]);

      const result = await service.getRevenueSummary(1, new Date('2025-01-01'), new Date('2025-01-31'), 'month' as any);

      expect(result.totalRevenueCents).toBe(355000); // 155000 + 200000
      expect(result.totalLoadCount).toBe(2);
      expect(result.avgRatePerMileCents).toBeGreaterThan(0);
    });

    it('should handle zero loads', async () => {
      mockPrisma.load.findMany.mockResolvedValue([]);
      const result = await service.getRevenueSummary(1, new Date(), new Date(), 'month' as any);
      expect(result.totalRevenueCents).toBe(0);
      expect(result.totalLoadCount).toBe(0);
    });

    it('should use invoice total over rate when available', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          rateCents: 100000,
          deliveredAt: new Date('2025-01-15'),
          estimatedMiles: 100,
          actualMiles: 100,
          invoices: [{ totalCents: 120000 }],
        },
      ]);

      const result = await service.getRevenueSummary(1, new Date('2025-01-01'), new Date('2025-01-31'), 'day' as any);
      expect(result.totalRevenueCents).toBe(120000);
    });
  });

  describe('getRevenueByCustomer', () => {
    it('should group revenue by customer and sort by revenue', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          rateCents: 100000,
          customerId: 1,
          estimatedMiles: 200,
          actualMiles: null,
          customer: { id: 1, companyName: 'Acme' },
          invoices: [],
        },
        {
          rateCents: 200000,
          customerId: 2,
          estimatedMiles: 400,
          actualMiles: null,
          customer: { id: 2, companyName: 'Big Corp' },
          invoices: [],
        },
      ]);

      const result = await service.getRevenueByCustomer(1, new Date('2025-01-01'), new Date('2025-12-31'));

      expect(result[0].companyName).toBe('Big Corp');
      expect(result[0].revenueCents).toBe(200000);
    });
  });
});

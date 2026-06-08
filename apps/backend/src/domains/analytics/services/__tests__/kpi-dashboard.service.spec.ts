import { Test, TestingModule } from '@nestjs/testing';
import { KpiDashboardService } from '../kpi-dashboard.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';

const mockPrisma = {
  invoice: { aggregate: jest.fn() },
  load: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  driver: { count: jest.fn() },
  shieldAudit: { findFirst: jest.fn() },
  settlement: { aggregate: jest.fn() },
};

const mockCache = {
  getOrSet: jest.fn((_key, factory) => factory()),
};

describe('KpiDashboardService', () => {
  let service: KpiDashboardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KpiDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SallyCacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<KpiDashboardService>(KpiDashboardService);
  });

  it('should compute KPIs correctly', async () => {
    mockPrisma.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { totalCents: 50000 } }) // today revenue
      .mockResolvedValueOnce({ _sum: { totalCents: 500000 } }) // MTD revenue
      .mockResolvedValueOnce({ _sum: { balanceCents: 100000 } }) // AR outstanding
      .mockResolvedValueOnce({ _sum: { totalCents: 500000 } }); // MTD margin revenue
    mockPrisma.load.count.mockResolvedValue(15); // active loads
    mockPrisma.load.findMany.mockResolvedValue([]); // on-time loads
    mockPrisma.driver.count.mockResolvedValue(10);
    mockPrisma.load.groupBy.mockResolvedValue([{ driverId: 1 }, { driverId: 2 }]);
    mockPrisma.shieldAudit.findFirst.mockResolvedValue({ overallScore: 92 });
    mockPrisma.settlement.aggregate.mockResolvedValue({
      _sum: { grossPayCents: 300000 },
    });

    const result = await service.getKpis(1);

    expect(result.todayRevenueCents).toBe(50000);
    expect(result.mtdRevenueCents).toBe(500000);
    expect(result.activeLoads).toBe(15);
    expect(result.arOutstandingCents).toBe(100000);
    expect(result.shieldScore).toBe(92);
    expect(result.fleetUtilizationPercent).toBe(20); // 2/10 * 100
    expect(result.mtdMarginPercent).toBe(40); // (500k-300k)/500k * 100
  });

  it('should handle zero drivers for utilization', async () => {
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalCents: 0 } });
    mockPrisma.load.count.mockResolvedValue(0);
    mockPrisma.load.findMany.mockResolvedValue([]);
    mockPrisma.driver.count.mockResolvedValue(0);
    mockPrisma.load.groupBy.mockResolvedValue([]);
    mockPrisma.shieldAudit.findFirst.mockResolvedValue(null);
    mockPrisma.settlement.aggregate.mockResolvedValue({
      _sum: { grossPayCents: 0 },
    });

    const result = await service.getKpis(1);

    expect(result.fleetUtilizationPercent).toBe(0);
    expect(result.shieldScore).toBeNull();
  });

  it('should calculate on-time percentage', async () => {
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalCents: 0 } });
    mockPrisma.load.count.mockResolvedValue(0);
    mockPrisma.load.findMany.mockResolvedValue([
      {
        deliveredAt: new Date('2025-01-15T10:00:00Z'),
        deliveryDate: new Date('2025-01-15'),
      },
      {
        deliveredAt: new Date('2025-01-17T10:00:00Z'),
        deliveryDate: new Date('2025-01-15'),
      }, // late
    ]);
    mockPrisma.driver.count.mockResolvedValue(0);
    mockPrisma.load.groupBy.mockResolvedValue([]);
    mockPrisma.shieldAudit.findFirst.mockResolvedValue(null);
    mockPrisma.settlement.aggregate.mockResolvedValue({
      _sum: { grossPayCents: 0 },
    });

    const result = await service.getKpis(1);
    expect(result.onTimePercent).toBe(50);
  });
});

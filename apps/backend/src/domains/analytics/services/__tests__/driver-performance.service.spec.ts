import { Test, TestingModule } from '@nestjs/testing';
import { DriverPerformanceService } from '../driver-performance.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';

const mockPrisma = {
  driver: { findMany: jest.fn() },
  load: { findMany: jest.fn() },
};

const mockCache = {
  getOrSet: jest.fn((_key, factory) => factory()),
};

describe('DriverPerformanceService', () => {
  let service: DriverPerformanceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverPerformanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SallyCacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<DriverPerformanceService>(DriverPerformanceService);
  });

  it('should aggregate driver performance metrics', async () => {
    mockPrisma.driver.findMany.mockResolvedValue([
      { id: 1, name: 'John Smith' },
      { id: 2, name: 'Jane Doe' },
    ]);
    mockPrisma.load.findMany.mockResolvedValue([
      {
        driverId: 1,
        rateCents: 150000,
        deliveredAt: new Date('2025-01-15T10:00:00Z'),
        deliveryDate: new Date('2025-01-15'),
        estimatedMiles: 500,
        actualMiles: 510,
        invoices: [{ totalCents: 155000 }],
        settlementLineItems: [{ payAmountCents: 80000 }],
      },
      {
        driverId: 1,
        rateCents: 100000,
        deliveredAt: new Date('2025-01-20T18:00:00Z'),
        deliveryDate: new Date('2025-01-19'), // late
        estimatedMiles: 300,
        actualMiles: null,
        invoices: [],
        settlementLineItems: [{ payAmountCents: 50000 }],
      },
    ]);

    const result = await service.getDriverPerformance(1, new Date(), new Date());

    expect(result).toHaveLength(1); // Only driver 1 has loads, driver 2 filtered out
    expect(result[0].driverName).toBe('John Smith');
    expect(result[0].loadsCompleted).toBe(2);
    expect(result[0].revenueCents).toBe(255000);
    expect(result[0].earningsCents).toBe(130000);
    expect(result[0].onTimePercent).toBe(50); // 1 on-time, 1 late
    expect(result[0].totalMiles).toBe(810);
  });

  it('should return empty for no loads', async () => {
    mockPrisma.driver.findMany.mockResolvedValue([{ id: 1, name: 'John' }]);
    mockPrisma.load.findMany.mockResolvedValue([]);

    const result = await service.getDriverPerformance(1, new Date(), new Date());
    expect(result).toHaveLength(0);
  });
});

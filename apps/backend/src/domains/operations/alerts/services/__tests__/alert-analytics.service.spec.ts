import { Test, TestingModule } from '@nestjs/testing';
import { AlertAnalyticsService } from '../alert-analytics.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';

describe('AlertAnalyticsService', () => {
  let service: AlertAnalyticsService;

  const mockPrisma = {
    alert: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    // Phase 2 Task 10 — getAlertHistory resolves driver slug → Int FK via
    // findUnique before the where clause when a driverId filter is passed.
    driver: { findUnique: jest.fn() },
  };

  const mockCache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SallyCacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AlertAnalyticsService>(AlertAnalyticsService);
    jest.clearAllMocks();
  });

  describe('getVolumeByCategory', () => {
    it('should return alert counts grouped by category', async () => {
      mockPrisma.alert.groupBy.mockResolvedValue([
        { category: 'compliance', _count: { id: 15 } },
        { category: 'schedule', _count: { id: 8 } },
      ]);

      const result = await service.getVolumeByCategory(1, 7);

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('compliance');
      expect(result[0].count).toBe(15);
    });
  });

  describe('getResponseTimeTrend', () => {
    it('should return daily average response times', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-02-05T10:00:00Z'),
          acknowledgedAt: new Date('2026-02-05T10:05:00Z'),
        },
        {
          createdAt: new Date('2026-02-05T11:00:00Z'),
          acknowledgedAt: new Date('2026-02-05T11:10:00Z'),
        },
      ]);

      const result = await service.getResponseTimeTrend(1, 7);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getAlertHistory', () => {
    it('should return paginated alert history', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);
      mockPrisma.alert.count.mockResolvedValue(0);

      const result = await service.getAlertHistory(1, { page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should apply all filter parameters', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);
      mockPrisma.alert.count.mockResolvedValue(0);
      // Phase 2 Task 10 — service resolves slug → Int FK before the query.
      mockPrisma.driver.findUnique.mockResolvedValue({ id: 55 });

      await service.getAlertHistory(1, {
        page: 2,
        limit: 10,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        category: 'compliance',
        priority: 'high',
        status: 'active',
        driverId: 'DRV-1',
      });

      expect(mockPrisma.driver.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { driverId: 'DRV-1' } }),
      );
      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            category: 'compliance',
            priority: 'high',
            status: 'active',
            driverId: 55,
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should compute totalPages correctly', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);
      mockPrisma.alert.count.mockResolvedValue(45);

      const result = await service.getAlertHistory(1, { page: 1, limit: 10 });

      expect(result.totalPages).toBe(5);
      expect(result.total).toBe(45);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should use default page and limit when not provided', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);
      mockPrisma.alert.count.mockResolvedValue(0);

      const result = await service.getAlertHistory(1, {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('getVolumeByPriority', () => {
    it('should return alert counts grouped by priority', async () => {
      mockPrisma.alert.groupBy.mockResolvedValue([
        { priority: 'critical', _count: { id: 5 } },
        { priority: 'high', _count: { id: 10 } },
        { priority: 'medium', _count: { id: 20 } },
        { priority: 'low', _count: { id: 8 } },
      ]);

      const result = await service.getVolumeByPriority(1, 7);

      expect(result).toHaveLength(4);
      expect(result[0].priority).toBe('critical');
      expect(result[0].count).toBe(5);
    });

    it('should use cache via getOrSet', async () => {
      const cachedResult = [{ priority: 'high', count: 3 }];
      mockCache.getOrSet.mockResolvedValueOnce(cachedResult);

      const result = await service.getVolumeByPriority(1, 7);

      expect(result).toEqual(cachedResult);
    });
  });

  describe('getResolutionRates', () => {
    it('should compute rates correctly with data', async () => {
      mockCache.getOrSet.mockImplementation((_key: string, fn: () => any) => fn());
      mockPrisma.alert.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60) // resolved
        .mockResolvedValueOnce(10) // autoResolved
        .mockResolvedValueOnce(5); // escalated

      const result = await service.getResolutionRates(1, 7);

      expect(result.total).toBe(100);
      expect(result.resolved).toBe(60);
      expect(result.autoResolved).toBe(10);
      expect(result.escalated).toBe(5);
      expect(result.resolutionRate).toBe(70); // (60+10)/100 * 100
      expect(result.escalationRate).toBe(5); // 5/100 * 100
    });

    it('should return 0 rates when no alerts exist', async () => {
      mockCache.getOrSet.mockImplementation((_key: string, fn: () => any) => fn());
      mockPrisma.alert.count.mockResolvedValue(0);

      const result = await service.getResolutionRates(1, 7);

      expect(result.resolutionRate).toBe(0);
      expect(result.escalationRate).toBe(0);
    });
  });

  describe('getTopAlertTypes', () => {
    it('should return top alert types', async () => {
      mockCache.getOrSet.mockImplementation((_key: string, fn: () => any) => fn());
      mockPrisma.alert.groupBy.mockResolvedValue([
        { alertType: 'HOS_VIOLATION', _count: { id: 15 } },
        { alertType: 'APPOINTMENT_AT_RISK', _count: { id: 10 } },
      ]);

      const result = await service.getTopAlertTypes(1, 7);

      expect(result).toHaveLength(2);
      expect(result[0].alertType).toBe('HOS_VIOLATION');
      expect(result[0].count).toBe(15);
    });
  });

  describe('getResponseTimeTrend — detailed', () => {
    it('should calculate daily average response times', async () => {
      mockCache.getOrSet.mockImplementation((_key: string, fn: () => any) => fn());
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-02-05T10:00:00Z'),
          acknowledgedAt: new Date('2026-02-05T10:05:00Z'),
        },
        {
          createdAt: new Date('2026-02-05T11:00:00Z'),
          acknowledgedAt: new Date('2026-02-05T11:15:00Z'),
        },
        {
          createdAt: new Date('2026-02-06T09:00:00Z'),
          acknowledgedAt: new Date('2026-02-06T09:30:00Z'),
        },
      ]);

      const result = await service.getResponseTimeTrend(1, 7);

      expect(result).toHaveLength(2);
      // Day 1: avg = (5 + 15) / 2 = 10 min
      const day1 = result.find((r) => r.date === '2026-02-05');
      expect(day1).toBeDefined();
      expect(day1.avgResponseMinutes).toBe(10);
      expect(day1.alertCount).toBe(2);
      // Day 2: avg = 30 min
      const day2 = result.find((r) => r.date === '2026-02-06');
      expect(day2).toBeDefined();
      expect(day2.avgResponseMinutes).toBe(30);
      expect(day2.alertCount).toBe(1);
    });

    it('should return empty array when no acknowledged alerts', async () => {
      mockCache.getOrSet.mockImplementation((_key: string, fn: () => any) => fn());
      mockPrisma.alert.findMany.mockResolvedValue([]);

      const result = await service.getResponseTimeTrend(1, 7);

      expect(result).toEqual([]);
    });
  });

  describe('getVolumeByCategory — cache usage', () => {
    it('should return cached data without hitting DB', async () => {
      const cachedData = [{ category: 'hos', count: 5 }];
      mockCache.getOrSet.mockResolvedValueOnce(cachedData);

      const result = await service.getVolumeByCategory(1, 7);

      expect(result).toEqual(cachedData);
    });
  });
});

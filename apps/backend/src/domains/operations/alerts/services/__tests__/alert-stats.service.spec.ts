import { Test } from '@nestjs/testing';
import { AlertStatsService } from '../alert-stats.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { AlertCacheService } from '../alert-cache.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';

describe('AlertStatsService', () => {
  let service: AlertStatsService;
  let prisma: any;
  let sallyCache: any;

  beforeEach(async () => {
    prisma = {
      alert: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      load: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    sallyCache = {
      getOrSet: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
    };

    const module = await Test.createTestingModule({
      providers: [
        AlertStatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertCacheService, useValue: {} },
        { provide: SallyCacheService, useValue: sallyCache },
      ],
    }).compile();

    service = module.get(AlertStatsService);
  });

  describe('getStats', () => {
    it('should return zero stats when no alerts', async () => {
      const result = await service.getStats(1);
      expect(result).toEqual({
        active: 0,
        critical: 0,
        avgResponseTimeMinutes: 0,
        resolvedToday: 0,
      });
    });

    it('should compute average response time', async () => {
      prisma.alert.count
        .mockResolvedValueOnce(5) // active
        .mockResolvedValueOnce(2) // critical
        .mockResolvedValueOnce(3); // resolvedToday
      prisma.alert.findMany.mockResolvedValue([
        {
          createdAt: new Date(Date.now() - 600000),
          acknowledgedAt: new Date(Date.now() - 300000),
        }, // 5 min response
        {
          createdAt: new Date(Date.now() - 600000),
          acknowledgedAt: new Date(Date.now() - 0),
        }, // 10 min response
      ]);
      const result = await service.getStats(1);
      expect(result.active).toBe(5);
      expect(result.critical).toBe(2);
      expect(result.resolvedToday).toBe(3);
      expect(result.avgResponseTimeMinutes).toBeGreaterThan(0);
    });
  });

  describe('getSmartStats', () => {
    it('should return zero smart stats when no data', async () => {
      prisma.alert.groupBy.mockResolvedValue([]);
      prisma.load.groupBy.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);
      const result = await service.getSmartStats(1);
      expect(result).toEqual({
        driversWithIssues: 0,
        totalActiveDrivers: 0,
        loadsAtRisk: 0,
        totalActiveLoads: 0,
        recurringAlerts: 0,
        avgResolveTimeMinutes: 0,
      });
    });

    it('should compute smart stats correctly', async () => {
      prisma.alert.groupBy
        .mockResolvedValueOnce([{ driverId: 1 }, { driverId: 2 }]) // driversWithIssues
        .mockResolvedValueOnce([{ loadId: 1 }]); // loadsWithIssues
      prisma.load.groupBy.mockResolvedValue([{ driverId: 1 }, { driverId: 2 }, { driverId: 3 }]); // totalActiveDrivers
      prisma.load.count.mockResolvedValue(10); // totalActiveLoads
      prisma.alert.count.mockResolvedValue(1); // recurringAlerts
      prisma.alert.findMany.mockResolvedValue([
        {
          createdAt: new Date(Date.now() - 1200000),
          resolvedAt: new Date(Date.now() - 600000),
        }, // 10 min resolve
      ]);
      const result = await service.getSmartStats(1);
      expect(result.driversWithIssues).toBe(2);
      expect(result.totalActiveDrivers).toBe(3);
      expect(result.loadsAtRisk).toBe(1);
      expect(result.totalActiveLoads).toBe(10);
      expect(result.recurringAlerts).toBe(1);
      expect(result.avgResolveTimeMinutes).toBe(10);
    });
  });
});

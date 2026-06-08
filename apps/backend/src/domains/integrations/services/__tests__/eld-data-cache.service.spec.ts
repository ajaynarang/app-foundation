import { Test } from '@nestjs/testing';
import { EldDataCacheService } from '../eld-data-cache.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';

const TENANT_ID = 1;

describe('EldDataCacheService', () => {
  let service: EldDataCacheService;
  let cache: { get: jest.Mock; set: jest.Mock };
  let prisma: {
    driver: { findFirst: jest.Mock };
    vehicle: { findFirst: jest.Mock };
    vehicleTelematics: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    cache = { get: jest.fn(), set: jest.fn() };
    prisma = {
      driver: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn() },
      vehicleTelematics: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        EldDataCacheService,
        { provide: AppCacheService, useValue: cache },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(EldDataCacheService);
  });

  describe('getDriverHOS', () => {
    it('returns from Redis when cached', async () => {
      const hosData = {
        driverId: 'd1',
        driveTimeRemainingMs: 36000000,
        currentDutyStatus: 'driving',
      };
      cache.get.mockResolvedValue(hosData);

      const result = await service.getDriverHOS(TENANT_ID, 'd1');
      expect(result).toEqual(hosData);
      expect(cache.get).toHaveBeenCalledWith('sally:eld:hos:1:d1');
      expect(prisma.driver.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to Postgres with tenantId and backfills Redis', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.driver.findFirst.mockResolvedValue({
        hosData: { driverId: 'd1', driveTimeRemainingMs: 36000000 },
        hosDataSyncedAt: new Date(),
      });

      const result = await service.getDriverHOS(TENANT_ID, 'd1');
      expect(result).toBeDefined();
      expect(result.driverId).toBe('d1');
      // Verify tenant-scoped Postgres query
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { driverId: 'd1', tenantId: TENANT_ID },
        select: { hosData: true, hosDataSyncedAt: true },
      });
      // Verify tenant-scoped Redis backfill — object passed through, AppCacheService handles serialization.
      expect(cache.set).toHaveBeenCalledWith(
        'sally:eld:hos:1:d1',
        expect.objectContaining({ driverId: 'd1' }),
        600_000,
      );
    });

    it('returns null when no data exists', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.driver.findFirst.mockResolvedValue(null);

      const result = await service.getDriverHOS(TENANT_ID, 'd1');
      expect(result).toBeNull();
    });

    it('falls back to Postgres when Redis throws', async () => {
      cache.get.mockRejectedValue(new Error('Redis down'));
      prisma.driver.findFirst.mockResolvedValue({
        hosData: { driverId: 'd1', driveTimeRemainingMs: 36000000 },
        hosDataSyncedAt: new Date(),
      });

      const result = await service.getDriverHOS(TENANT_ID, 'd1');
      expect(result).toBeDefined();
    });
  });

  describe('getVehicleTelematics', () => {
    it('returns from Redis when cached', async () => {
      const telData = { vehicleId: 'v1', latitude: 42.0, longitude: -71.0 };
      cache.get.mockResolvedValue(telData);

      const result = await service.getVehicleTelematics(TENANT_ID, 'v1');
      expect(result).toEqual(telData);
      expect(cache.get).toHaveBeenCalledWith('sally:eld:tel:1:v1');
      expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to Postgres with tenantId on cache miss', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.vehicle.findFirst.mockResolvedValue({ id: 1 });
      prisma.vehicleTelematics.findUnique.mockResolvedValue({
        latitude: 42.0,
        longitude: -71.0,
        speed: 55,
        heading: 180,
        fuelLevel: 0.75,
        engineRunning: true,
        odometer: 50000,
        timestamp: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getVehicleTelematics(TENANT_ID, 'v1');
      expect(result).toBeDefined();
      expect(result.latitude).toBe(42.0);
      // Verify tenant-scoped Postgres query
      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
        where: { vehicleId: 'v1', tenantId: TENANT_ID },
        select: { id: true },
      });
      // Verify tenant-scoped Redis backfill — object passed through.
      expect(cache.set).toHaveBeenCalledWith(
        'sally:eld:tel:1:v1',
        expect.objectContaining({ vehicleId: 'v1' }),
        120_000,
      );
    });

    it('returns null when vehicle not found', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.vehicle.findFirst.mockResolvedValue(null);

      const result = await service.getVehicleTelematics(TENANT_ID, 'v1');
      expect(result).toBeNull();
    });

    it('returns null when vehicle exists but no telematics', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.vehicle.findFirst.mockResolvedValue({ id: 1 });
      prisma.vehicleTelematics.findUnique.mockResolvedValue(null);

      const result = await service.getVehicleTelematics(TENANT_ID, 'v1');
      expect(result).toBeNull();
    });
  });

  describe('setDriverHOS', () => {
    it('writes to Redis with tenant-scoped key and TTL', async () => {
      await service.setDriverHOS(TENANT_ID, 'd1', {
        driverId: 'd1',
        currentDutyStatus: 'driving',
        driveTimeRemainingMs: 36000000,
        shiftTimeRemainingMs: 50400000,
        cycleTimeRemainingMs: 252000000,
        timeUntilBreakMs: 28800000,
        dataSource: 'samsara',
        lastUpdated: '2026-01-01T00:00:00Z',
        syncedAt: '2026-01-01T00:00:00Z',
      });

      expect(cache.set).toHaveBeenCalledWith(
        'sally:eld:hos:1:d1',
        expect.objectContaining({ driverId: 'd1' }),
        600_000,
      );
    });

    it('does not throw when Redis write fails', async () => {
      cache.set.mockRejectedValue(new Error('Redis down'));

      await expect(
        service.setDriverHOS(TENANT_ID, 'd1', {
          driverId: 'd1',
          currentDutyStatus: 'driving',
          driveTimeRemainingMs: 36000000,
          shiftTimeRemainingMs: 50400000,
          cycleTimeRemainingMs: 252000000,
          timeUntilBreakMs: 28800000,
          dataSource: 'samsara',
          lastUpdated: '2026-01-01T00:00:00Z',
          syncedAt: '2026-01-01T00:00:00Z',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('setVehicleTelematics', () => {
    it('writes to Redis with tenant-scoped key and TTL', async () => {
      await service.setVehicleTelematics(TENANT_ID, 'v1', {
        vehicleId: 'v1',
        latitude: 42.0,
        longitude: -71.0,
        speed: 55,
        heading: 180,
        fuelLevel: 0.75,
        engineRunning: true,
        odometer: 50000,
        timestamp: '2026-01-01T00:00:00Z',
        syncedAt: '2026-01-01T00:00:00Z',
      });

      expect(cache.set).toHaveBeenCalledWith(
        'sally:eld:tel:1:v1',
        expect.objectContaining({ vehicleId: 'v1' }),
        120_000,
      );
    });
  });
});

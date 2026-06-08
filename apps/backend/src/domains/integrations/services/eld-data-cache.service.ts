import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';

export interface HOSCacheData {
  driverId: string;
  currentDutyStatus: string;
  driveTimeRemainingMs: number;
  shiftTimeRemainingMs: number;
  cycleTimeRemainingMs: number;
  timeUntilBreakMs: number;
  dataSource: string;
  lastUpdated: string;
  syncedAt: string;
}

export interface TelematicsCacheData {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  fuelLevel: number | null;
  engineRunning: boolean;
  odometer: number;
  timestamp: string;
  syncedAt: string;
}

const HOS_TTL_MS = 600_000; // 10 minutes
const TELEMATICS_TTL_MS = 120_000; // 2 minutes

@Injectable()
export class EldDataCacheService {
  private readonly logger = new Logger(EldDataCacheService.name);

  constructor(
    private readonly cache: AppCacheService,
    private prisma: PrismaService,
  ) {}

  // ── WRITE (called by batch sync only) ──

  async setDriverHOS(tenantId: number, driverId: string, data: HOSCacheData): Promise<void> {
    try {
      const key = buildKey('sally:eld:hos', String(tenantId), driverId);
      await this.cache.set(key, data, HOS_TTL_MS);
    } catch (err) {
      this.logger.warn(`Redis write failed for sally:eld:hos:${tenantId}:${driverId}: ${(err as Error).message}`);
    }
  }

  async setVehicleTelematics(tenantId: number, vehicleId: string, data: TelematicsCacheData): Promise<void> {
    try {
      const key = buildKey('sally:eld:tel', String(tenantId), vehicleId);
      await this.cache.set(key, data, TELEMATICS_TTL_MS);
    } catch (err) {
      this.logger.warn(`Redis write failed for sally:eld:tel:${tenantId}:${vehicleId}: ${(err as Error).message}`);
    }
  }

  // ── READ (called by everyone) ──

  async getDriverHOS(tenantId: number, driverId: string): Promise<HOSCacheData | null> {
    const cacheKey = buildKey('sally:eld:hos', String(tenantId), driverId);

    // Try Redis first
    try {
      const cached = await this.cache.get<HOSCacheData>(cacheKey);
      if (cached) return cached;
    } catch {
      // Redis down — fall through to Postgres
    }

    // Fallback to Postgres (tenant-scoped)
    const driver = await this.prisma.driver.findFirst({
      where: { driverId, tenantId },
      select: { hosData: true, hosDataSyncedAt: true },
    });

    if (driver?.hosData) {
      // Staleness check — don't backfill Redis with data older than TTL
      const ageMs = driver.hosDataSyncedAt ? Date.now() - driver.hosDataSyncedAt.getTime() : Infinity;
      if (ageMs > HOS_TTL_MS) {
        this.logger.debug(`Stale HOS data for driver ${driverId} (age=${ageMs}ms > TTL=${HOS_TTL_MS}ms), skipping`);
        return null;
      }

      const data = {
        ...(driver.hosData as Record<string, any>),
        syncedAt: driver.hosDataSyncedAt?.toISOString(),
      } as HOSCacheData;

      // Backfill Redis
      await this.setDriverHOS(tenantId, driverId, data);
      return data;
    }

    return null;
  }

  async getVehicleTelematics(tenantId: number, vehicleId: string): Promise<TelematicsCacheData | null> {
    const cacheKey = buildKey('sally:eld:tel', String(tenantId), vehicleId);

    // Try Redis first
    try {
      const cached = await this.cache.get<TelematicsCacheData>(cacheKey);
      if (cached) return cached;
    } catch {
      // Redis down — fall through to Postgres
    }

    // Fallback to Postgres (tenant-scoped)
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { vehicleId, tenantId },
      select: { id: true },
    });
    if (!vehicle) return null;

    const telematics = await this.prisma.vehicleTelematics.findUnique({
      where: { vehicleId: vehicle.id },
    });

    if (telematics) {
      // Staleness check — don't backfill Redis with data older than TTL
      const ageMs = telematics.updatedAt ? Date.now() - telematics.updatedAt.getTime() : Infinity;
      if (ageMs > TELEMATICS_TTL_MS) {
        this.logger.debug(
          `Stale telematics for vehicle ${vehicleId} (age=${ageMs}ms > TTL=${TELEMATICS_TTL_MS}ms), skipping`,
        );
        return null;
      }

      const data: TelematicsCacheData = {
        vehicleId,
        latitude: telematics.latitude,
        longitude: telematics.longitude,
        speed: telematics.speed,
        heading: telematics.heading,
        fuelLevel: telematics.fuelLevel,
        engineRunning: telematics.engineRunning,
        odometer: telematics.odometer,
        timestamp: telematics.timestamp.toISOString(),
        syncedAt: telematics.updatedAt.toISOString(),
      };

      // Backfill Redis
      await this.setVehicleTelematics(tenantId, vehicleId, data);
      return data;
    }

    return null;
  }
}

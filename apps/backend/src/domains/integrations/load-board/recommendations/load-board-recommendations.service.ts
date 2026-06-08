import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';
import { LoadBoardService } from '../load-board.service';
import type { LoadBoardListing } from '@sally/shared-types';

export interface DriverLoadRecommendation {
  driver: {
    id: string;
    name: string;
    location: { city: string; state: string; lat: number; lng: number };
  };
  reason: string;
  listings: LoadBoardListing[];
}

const MAX_DRIVERS = 5;
const MAX_LOADS_PER_DRIVER = 3;
const STALE_TELEMATICS_MS = 24 * 60 * 60 * 1000; // ignore telematics older than 24h

@Injectable()
export class LoadBoardRecommendationsService {
  private readonly logger = new Logger(LoadBoardRecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loadBoardService: LoadBoardService,
    private readonly cache: SallyCacheService,
  ) {}

  async getRecommendations(tenantId: number): Promise<DriverLoadRecommendation[]> {
    const cacheKey = buildKey('sally:loadboard', 'recs', tenantId);
    const cached = await this.cache.get<DriverLoadRecommendation[]>(cacheKey);
    if (cached) return cached;

    return this.compute(tenantId);
  }

  private async compute(tenantId: number): Promise<DriverLoadRecommendation[]> {
    const staleThreshold = new Date(Date.now() - STALE_TELEMATICS_MS);

    // Get vehicles with recent telematics and assigned active drivers
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        status: 'AVAILABLE',
        assignedDriverId: { not: null },
        telematics: {
          timestamp: { gte: staleThreshold },
        },
      },
      select: {
        id: true,
        equipmentType: true,
        assignedDriver: {
          select: {
            driverId: true,
            name: true,
            status: true,
          },
        },
        telematics: {
          select: {
            latitude: true,
            longitude: true,
            timestamp: true,
          },
        },
      },
      take: MAX_DRIVERS * 2, // fetch extra in case some fail
    });

    // Filter to active drivers with valid telematics
    const candidates = vehicles.filter(
      (v) =>
        v.assignedDriver &&
        v.assignedDriver.status === 'ACTIVE' &&
        v.telematics &&
        v.telematics.latitude !== 0 &&
        v.telematics.longitude !== 0,
    );

    const recommendations: DriverLoadRecommendation[] = [];

    for (const vehicle of candidates.slice(0, MAX_DRIVERS)) {
      const driver = vehicle.assignedDriver;
      const telem = vehicle.telematics;

      try {
        // Reverse geocode to city/state for display and DAT search
        const location = await this.reverseGeocodeApprox(telem.latitude, telem.longitude);
        if (!location) continue;

        const result = await this.loadBoardService.search(tenantId, {
          origin: {
            city: location.city,
            state: location.state,
            radius: 100,
          },
          equipmentType: vehicle.equipmentType ? ([vehicle.equipmentType.toLowerCase()] as any) : undefined,
          provider: 'dat',
          page: 1,
          limit: MAX_LOADS_PER_DRIVER,
        });

        if (result.listings.length > 0) {
          const minutesAgo = Math.round((Date.now() - new Date(telem.timestamp).getTime()) / 60000);
          const timeLabel = minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.round(minutesAgo / 60)}h ago`;

          recommendations.push({
            driver: {
              id: driver.driverId,
              name: driver.name,
              location: {
                city: location.city,
                state: location.state,
                lat: telem.latitude,
                lng: telem.longitude,
              },
            },
            reason: `Near ${location.city}, ${location.state} · Updated ${timeLabel}`,
            listings: result.listings,
          });
        }
      } catch (error: any) {
        this.logger.warn(`Recommendation search failed for driver ${driver.driverId}: ${error.message}`);
      }
    }

    // Cache results
    await this.cache.set(buildKey('sally:loadboard', 'recs', tenantId), recommendations, CACHE_TTL_WARM_5M);

    return recommendations;
  }

  /**
   * Approximate reverse geocode using the nearest truck stop in our DB.
   * This avoids external API calls — we already have 50+ truck stops with city/state.
   * Falls back to null if no stops are within ~100 miles.
   */
  private async reverseGeocodeApprox(lat: number, lng: number): Promise<{ city: string; state: string } | null> {
    // Use Haversine-approximation: 1° lat ≈ 69mi, 1° lng ≈ 55mi (at US latitudes)
    const latRange = 1.5; // ~100 miles
    const lngRange = 1.8;

    const nearestStop = await this.prisma.stop.findFirst({
      where: {
        lat: { gte: lat - latRange, lte: lat + latRange },
        lon: { gte: lng - lngRange, lte: lng + lngRange },
        city: { not: null },
        state: { not: null },
      },
      select: { city: true, state: true, lat: true, lon: true },
      orderBy: { id: 'asc' }, // deterministic pick among nearby stops
    });

    if (!nearestStop?.city || !nearestStop?.state) return null;

    return { city: nearestStop.city, state: nearestStop.state };
  }
}

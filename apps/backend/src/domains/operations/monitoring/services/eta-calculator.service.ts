import { Injectable, Logger, Inject } from '@nestjs/common';
import { EARTH_RADIUS_MILES, AVG_TRUCK_SPEED_MPH } from '@sally/shared-types';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '../../../../constants/cache.constants';
import { ROUTING_PROVIDER, RoutingProvider } from '../../../routing/providers/routing/routing-provider.interface';

@Injectable()
export class EtaCalculatorService {
  private readonly logger = new Logger(EtaCalculatorService.name);

  constructor(
    private readonly cache: SallyCacheService,
    // Use the real road-network routing provider (HERE), NOT the platform-services
    // mock that returned haversine × multiplier with a mock_polyline. Command-center
    // / Tower ETAs must be road-aware.
    @Inject(ROUTING_PROVIDER)
    private readonly routingProvider: RoutingProvider,
  ) {}

  async getEstimatedDriveMinutes(
    from: { lat: number; lon: number } | null,
    to: { lat: number; lon: number } | null,
  ): Promise<number | null> {
    if (!from || !to) return null;

    const cacheKey = this.buildCacheKey(from, to);
    try {
      const cached = await this.cache.get<number>(cacheKey);
      if (cached !== null && cached !== undefined) return cached;
    } catch {
      // Redis down — compute without cache
    }

    // Real road-network truck routing (HERE), Haversine only as a last resort.
    let estimatedMinutes: number;
    try {
      const route = await this.routingProvider.getRoute({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon });
      estimatedMinutes = Math.round(route.driveTimeHours * 60);
    } catch {
      // Routing provider unavailable — Haversine fallback
      const distanceMiles = this.haversineDistance(from.lat, from.lon, to.lat, to.lon);
      estimatedMinutes = Math.round((distanceMiles / AVG_TRUCK_SPEED_MPH) * 60);
    }

    try {
      await this.cache.set(cacheKey, estimatedMinutes, CACHE_TTL_COLD_30M);
    } catch {
      // Cache write failure — non-critical
    }
    return estimatedMinutes;
  }

  private buildCacheKey(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
    // Round from (driver position) to 2 decimals (~1.1km) for cache reuse.
    // Round to (stop position) to 3 decimals (~110m) for accuracy.
    const fLat = Math.round(from.lat * 100) / 100;
    const fLon = Math.round(from.lon * 100) / 100;
    const tLat = Math.round(to.lat * 1000) / 1000;
    const tLon = Math.round(to.lon * 1000) / 1000;
    return buildKey('sally:monitoring', 'eta', `${fLat},${fLon}`, `${tLat},${tLon}`);
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = EARTH_RADIUS_MILES;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

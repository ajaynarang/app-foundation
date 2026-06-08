import { Injectable, Logger } from '@nestjs/common';
import { EARTH_RADIUS_MILES } from '@sally/shared-types';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FuelDataProvider, FuelStop, FuelStopFilter } from './fuel-data-provider.interface';

@Injectable()
export class DatabaseFuelProvider implements FuelDataProvider {
  private readonly logger = new Logger(DatabaseFuelProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async findFuelStopsNearPoint(
    lat: number,
    lon: number,
    radiusMiles: number,
    filter?: FuelStopFilter,
  ): Promise<FuelStop[]> {
    this.logger.debug(`Finding fuel stops near (${lat}, ${lon}) within ${radiusMiles} miles`);

    const stops = await this.queryFuelStops(filter?.acceptedBrands);

    const results: FuelStop[] = [];

    for (const stop of stops) {
      const distance = this.haversine(lat, lon, stop.lat, stop.lon);

      if (distance <= radiusMiles) {
        results.push(this.mapToFuelStop(stop, distance));
      }
    }

    // Sort by fuel price ascending (cheapest first)
    results.sort((a, b) => a.fuelPricePerGallon - b.fuelPricePerGallon);

    this.logger.debug(`Found ${results.length} fuel stops near (${lat}, ${lon})`);

    return results;
  }

  async findFuelStopsAlongCorridor(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
    corridorWidthMiles: number,
    filter?: FuelStopFilter,
  ): Promise<FuelStop[]> {
    this.logger.debug(
      `Finding fuel stops along corridor (${fromLat}, ${fromLon}) -> (${toLat}, ${toLon}), width ${corridorWidthMiles} miles`,
    );

    const stops = await this.queryFuelStops(filter?.acceptedBrands);

    const results: FuelStop[] = [];

    for (const stop of stops) {
      const distance = this.pointToSegmentDistance(stop.lat, stop.lon, fromLat, fromLon, toLat, toLon);

      if (distance <= corridorWidthMiles) {
        results.push(this.mapToFuelStop(stop, distance));
      }
    }

    // Sort by fuel price ascending (cheapest first)
    results.sort((a, b) => a.fuelPricePerGallon - b.fuelPricePerGallon);

    this.logger.debug(`Found ${results.length} fuel stops along corridor`);

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async queryFuelStops(acceptedBrands?: string[]) {
    return this.prisma.stop.findMany({
      where: {
        isActive: true,
        locationType: {
          in: ['TRUCK_STOP', 'FUEL_STATION'],
        },
        fuelPricePerGallon: {
          not: null,
        },
        lat: {
          not: null,
        },
        lon: {
          not: null,
        },
        ...(acceptedBrands && acceptedBrands.length > 0 ? { fuelBrand: { in: acceptedBrands } } : {}),
      },
    });
  }

  private mapToFuelStop(
    stop: {
      stopId: string;
      name: string;
      lat: number | null;
      lon: number | null;
      city: string | null;
      state: string | null;
      fuelPricePerGallon: number | null;
      fuelBrand: string | null;
      amenities: unknown;
    },
    distanceFromRoute: number,
  ): FuelStop {
    return {
      stopId: stop.stopId,
      name: stop.name,
      lat: stop.lat ?? 0,
      lon: stop.lon ?? 0,
      city: stop.city ?? '',
      state: stop.state ?? '',
      fuelPricePerGallon: stop.fuelPricePerGallon ?? 0,
      brand: stop.fuelBrand ?? '',
      amenities: Array.isArray(stop.amenities) ? (stop.amenities as string[]) : [],
      distanceFromRoute,
    };
  }

  /**
   * Calculate the great-circle distance between two points using the
   * haversine formula. Returns distance in miles.
   */
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const sinHalfLat = Math.sin(dLat / 2);
    const sinHalfLon = Math.sin(dLon / 2);

    const a =
      sinHalfLat * sinHalfLat + Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * sinHalfLon * sinHalfLon;

    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
  }

  /**
   * Calculate the perpendicular distance (in miles) from a point to a
   * line segment defined by two endpoints.
   *
   * Projects the point onto the line segment, clamps to the segment
   * bounds, then returns the haversine distance from the point to the
   * closest point on the segment.
   */
  private pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;

    // If the segment has zero length, return distance to the single point
    const segmentLengthSq = dx * dx + dy * dy;
    if (segmentLengthSq === 0) {
      return this.haversine(px, py, ax, ay);
    }

    // Project the point onto the line, clamping t to [0, 1]
    let t = ((px - ax) * dx + (py - ay) * dy) / segmentLengthSq;
    t = Math.max(0, Math.min(1, t));

    // Closest point on the segment
    const closestLat = ax + t * dx;
    const closestLon = ay + t * dy;

    return this.haversine(px, py, closestLat, closestLon);
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

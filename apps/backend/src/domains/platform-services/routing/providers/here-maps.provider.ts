import { Injectable, Logger } from '@nestjs/common';
import { EARTH_RADIUS_MILES } from '@sally/shared-types';
import { PlatformServicesConfig } from '../../platform-services.config';
import { IRoutingProvider, RouteResult, TruckProfile, Waypoint } from '../routing-provider.interface';

/**
 * ⚠️ MOCK ONLY — NOT a real HERE client. Do NOT use on any production path.
 *
 * This returns deterministic Haversine-based estimates (straight-line × factor)
 * with a `mock_polyline:` prefix — it does NOT call HERE. The Smart Route planner
 * and monitoring ETAs use the REAL provider at
 * `domains/routing/providers/routing/here-routing.provider.ts` (HERE Routing v8).
 * This class remains only as a placeholder/test double for the platform-services
 * routing seam; wiring it into a real feature would silently degrade to haversine.
 *
 * Real HERE API: https://developer.here.com/documentation/routing-api/dev_guide/index.html
 */
@Injectable()
export class HereMapsProvider implements IRoutingProvider {
  private readonly logger = new Logger(HereMapsProvider.name);

  constructor(private readonly config: PlatformServicesConfig) {}

  /**
   * Get a standard car route between origin and destination with optional intermediate waypoints.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies IRoutingProvider contract
  async getRoute(origin: Waypoint, destination: Waypoint, waypoints?: Waypoint[]): Promise<RouteResult> {
    this.logger.debug(
      `Calculating route from (${origin.latitude}, ${origin.longitude}) to (${destination.latitude}, ${destination.longitude}) with ${waypoints?.length ?? 0} waypoints`,
    );

    const allPoints = this.buildPointList(origin, destination, waypoints);
    const segments = this.buildSegments(allPoints);

    const totalDistance = segments.reduce((sum, s) => sum + s.distance_miles, 0);
    const totalDuration = segments.reduce((sum, s) => sum + s.duration_minutes, 0);

    return {
      distance_miles: Math.round(totalDistance * 100) / 100,
      duration_minutes: Math.round(totalDuration * 100) / 100,
      polyline: this.generateMockPolyline(allPoints),
      waypoints: allPoints,
      segments,
    };
  }

  /**
   * Get a truck-specific route. Truck routes are typically ~10% longer in distance
   * and ~15% longer in duration due to truck restrictions (low bridges, weight limits,
   * restricted roads, wider turning radii).
   */
  async getTruckRoute(
    origin: Waypoint,
    destination: Waypoint,
    waypoints?: Waypoint[],
    profile?: TruckProfile,
  ): Promise<RouteResult> {
    this.logger.debug(`Calculating truck route with profile: ${JSON.stringify(profile ?? {})}`);

    const baseRoute = await this.getRoute(origin, destination, waypoints);

    // Truck routes add overhead for restricted roads, lower speed limits, etc.
    const distanceMultiplier = profile?.hazmat ? 1.15 : 1.1;
    const durationMultiplier = profile?.hazmat ? 1.2 : 1.15;

    return {
      ...baseRoute,
      distance_miles: Math.round(baseRoute.distance_miles * distanceMultiplier * 100) / 100,
      duration_minutes: Math.round(baseRoute.duration_minutes * durationMultiplier * 100) / 100,
      segments: baseRoute.segments.map((seg) => ({
        ...seg,
        distance_miles: Math.round(seg.distance_miles * distanceMultiplier * 100) / 100,
        duration_minutes: Math.round(seg.duration_minutes * durationMultiplier * 100) / 100,
      })),
    };
  }

  /**
   * Build the ordered list of all points: origin -> waypoints -> destination.
   */
  private buildPointList(origin: Waypoint, destination: Waypoint, waypoints?: Waypoint[]): Waypoint[] {
    return [origin, ...(waypoints ?? []), destination];
  }

  /**
   * Build route segments between consecutive waypoints.
   * Uses Haversine distance and an average speed of 55 mph for duration estimation.
   */
  private buildSegments(points: Waypoint[]): RouteResult['segments'] {
    const avgSpeedMph = 55;
    const segments: RouteResult['segments'] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const distance = this.haversineDistance(start, end);
      const duration = (distance / avgSpeedMph) * 60; // convert hours to minutes

      segments.push({
        start,
        end,
        distance_miles: Math.round(distance * 100) / 100,
        duration_minutes: Math.round(duration * 100) / 100,
      });
    }

    return segments;
  }

  /**
   * Calculate the great-circle distance between two points using the Haversine formula.
   * Returns distance in miles.
   */
  private haversineDistance(a: Waypoint, b: Waypoint): number {
    const R = EARTH_RADIUS_MILES;

    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);

    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);

    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;

    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /**
   * Generate a mock encoded polyline string from waypoints.
   * In production this would be a real encoded polyline from the HERE API.
   * Here we encode the waypoints as a simplified polyline-like string.
   */
  private generateMockPolyline(points: Waypoint[]): string {
    // Produce a deterministic mock polyline based on the waypoints
    const encoded = points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(';');
    return `mock_polyline:${encoded}`;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { EARTH_RADIUS_MILES } from '@sally/shared-types';

import { Configuration } from '../../../../config/configuration';
import {
  DistanceMatrix,
  LatLon,
  RouteOptions,
  RouteResult,
  RoutingProvider,
  TruckProfile,
} from './routing-provider.interface';

const METERS_TO_MILES = 0.000621371;
const SECONDS_TO_HOURS = 1 / 3600;
const TIMEOUT_MS = 30_000;
const INCHES_TO_CM = 2.54;
const LBS_TO_KG = 0.453592;

@Injectable()
export class HereRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger(HereRoutingProvider.name);
  private readonly routeClient: AxiosInstance;
  private readonly matrixClient: AxiosInstance;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService<Configuration, true>) {
    this.apiKey = this.configService.get('hereApiKey', { infer: true }) ?? '';

    this.routeClient = axios.create({
      baseURL: 'https://router.hereapi.com/v8',
      timeout: TIMEOUT_MS,
    });

    this.matrixClient = axios.create({
      baseURL: 'https://matrix.router.hereapi.com/v8',
      timeout: TIMEOUT_MS,
    });

    this.logger.log('HERE Routing Provider initialized');
  }

  async getDistanceMatrix(stops: LatLon[], options?: RouteOptions): Promise<DistanceMatrix> {
    if (stops.length < 2) {
      return new Map();
    }

    try {
      const origins = stops.map((s) => ({ lat: s.lat, lng: s.lon }));

      const body: Record<string, unknown> = {
        origins,
        regionDefinition: { type: 'world' },
        transportMode: 'truck',
        ...this.buildMatrixVehicleBody(options),
      };

      const response = await this.matrixClient.post('/matrix', body, { params: { apiKey: this.apiKey } });

      const { matrix } = response.data;
      const result: DistanceMatrix = new Map();
      const numDest = matrix.numDestinations;

      for (let i = 0; i < stops.length; i++) {
        for (let j = 0; j < stops.length; j++) {
          if (i === j) continue;

          const fromId = stops[i].id ?? `${i}`;
          const toId = stops[j].id ?? `${j}`;
          const key = `${fromId}:${toId}`;

          const idx = numDest * i + j;
          const errorCode = matrix.errorCodes?.[idx];

          if (errorCode && errorCode !== 0) {
            this.logger.warn(`HERE matrix error for ${key}: code ${errorCode}, using haversine`);
            result.set(key, this.haversineEntry(stops[i], stops[j]));
            continue;
          }

          const distanceMiles = (matrix.distances?.[idx] ?? 0) * METERS_TO_MILES;
          const driveTimeHours = (matrix.travelTimes?.[idx] ?? 0) * SECONDS_TO_HOURS;

          result.set(key, { distanceMiles, driveTimeHours });
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `HERE matrix request failed, falling back to haversine: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.haversineFallbackMatrix(stops);
    }
  }

  async getRoute(
    origin: LatLon,
    destination: LatLon,
    waypoints?: LatLon[],
    options?: RouteOptions,
  ): Promise<RouteResult> {
    try {
      const params: Record<string, string> = {
        apiKey: this.apiKey,
        transportMode: 'truck',
        origin: `${origin.lat},${origin.lon}`,
        destination: `${destination.lat},${destination.lon}`,
        return: 'polyline,summary',
        ...this.buildRouteVehicleParams(options),
      };

      if (waypoints?.length) {
        waypoints.forEach((wp, i) => {
          params[`via${i > 0 ? i : ''}`] = `${wp.lat},${wp.lon}`;
        });
      }

      const response = await this.routeClient.get('/routes', { params });

      const route = response.data.routes[0];

      // Aggregate all sections for multi-section routes
      let totalDistance = 0;
      let totalDuration = 0;
      const polylines: string[] = [];

      for (const sec of route.sections) {
        totalDistance += sec.summary.length;
        totalDuration += sec.summary.duration;
        if (sec.polyline) {
          polylines.push(sec.polyline);
        }
      }

      const resultWaypoints: LatLon[] = [
        {
          lat: route.sections[0].departure.place.location.lat,
          lon: route.sections[0].departure.place.location.lng,
        },
        {
          lat: route.sections[route.sections.length - 1].arrival.place.location.lat,
          lon: route.sections[route.sections.length - 1].arrival.place.location.lng,
        },
      ];

      return {
        distanceMiles: totalDistance * METERS_TO_MILES,
        driveTimeHours: totalDuration * SECONDS_TO_HOURS,
        geometry: polylines.join(';'),
        waypoints: resultWaypoints,
      };
    } catch (error) {
      this.logger.warn(
        `HERE route request failed, falling back to haversine: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.haversineFallbackRoute(origin, destination, waypoints);
    }
  }

  // ---------------------------------------------------------------------------
  // HERE option translation (truck profile + toll avoidance)
  // ---------------------------------------------------------------------------

  /** Matrix v8 takes `avoid` and `truck` in the POST body. */
  private buildMatrixVehicleBody(options?: RouteOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const truck = this.truckSpec(options?.truckProfile);
    if (truck) body.truck = truck;
    if (options?.avoidTollRoads) body.avoid = { features: ['tollRoad'] };
    return body;
  }

  /** Routing v8 takes truck dimensions and `avoid[features]` as query params. */
  private buildRouteVehicleParams(options?: RouteOptions): Record<string, string> {
    const params: Record<string, string> = {};
    const profile = options?.truckProfile;
    if (profile?.grossWeightLbs)
      params['vehicle[grossWeight]'] = String(Math.round(profile.grossWeightLbs * LBS_TO_KG));
    if (profile?.heightInches) params['vehicle[height]'] = String(Math.round(profile.heightInches * INCHES_TO_CM));
    if (profile?.lengthInches) params['vehicle[length]'] = String(Math.round(profile.lengthInches * INCHES_TO_CM));
    if (profile?.widthInches) params['vehicle[width]'] = String(Math.round(profile.widthInches * INCHES_TO_CM));
    if (profile?.axleCount) params['truck[axleCount]'] = String(profile.axleCount);
    if (profile?.hazardousGoods?.length) params['vehicle[shippedHazardousGoods]'] = profile.hazardousGoods.join(',');
    if (options?.avoidTollRoads) params['avoid[features]'] = 'tollRoad';
    return params;
  }

  /** Matrix `truck` object: kg + cm, axle count, hazmat. Undefined if no profile. */
  private truckSpec(profile?: TruckProfile): Record<string, unknown> | undefined {
    if (!profile) return undefined;
    const truck: Record<string, unknown> = {};
    if (profile.grossWeightLbs) truck.grossWeight = Math.round(profile.grossWeightLbs * LBS_TO_KG);
    if (profile.heightInches) truck.height = Math.round(profile.heightInches * INCHES_TO_CM);
    if (profile.lengthInches) truck.length = Math.round(profile.lengthInches * INCHES_TO_CM);
    if (profile.widthInches) truck.width = Math.round(profile.widthInches * INCHES_TO_CM);
    if (profile.axleCount) truck.axleCount = profile.axleCount;
    if (profile.hazardousGoods?.length) truck.shippedHazardousGoods = profile.hazardousGoods;
    return Object.keys(truck).length > 0 ? truck : undefined;
  }

  // ---------------------------------------------------------------------------
  // Haversine fallback
  // ---------------------------------------------------------------------------

  private haversineFallbackMatrix(stops: LatLon[]): DistanceMatrix {
    const matrix: DistanceMatrix = new Map();

    for (let i = 0; i < stops.length; i++) {
      for (let j = 0; j < stops.length; j++) {
        if (i === j) continue;

        const fromId = stops[i].id ?? `${i}`;
        const toId = stops[j].id ?? `${j}`;
        matrix.set(`${fromId}:${toId}`, this.haversineEntry(stops[i], stops[j]));
      }
    }

    return matrix;
  }

  private haversineFallbackRoute(origin: LatLon, destination: LatLon, waypoints?: LatLon[]): RouteResult {
    const points = [origin, ...(waypoints ?? []), destination];
    let totalDistance = 0;
    let totalTime = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const entry = this.haversineEntry(points[i], points[i + 1]);
      totalDistance += entry.distanceMiles;
      totalTime += entry.driveTimeHours;
    }

    return {
      distanceMiles: totalDistance,
      driveTimeHours: totalTime,
      geometry: '',
      waypoints: points,
    };
  }

  private haversineEntry(a: LatLon, b: LatLon): { distanceMiles: number; driveTimeHours: number } {
    const straightLineMiles = this.haversineDistance(a, b);
    const distanceMiles = straightLineMiles * 1.3; // road factor
    const driveTimeHours = distanceMiles / 55; // avg truck speed

    return { distanceMiles, driveTimeHours };
  }

  private haversineDistance(a: LatLon, b: LatLon): number {
    const R = EARTH_RADIUS_MILES;
    const dLat = this.toRad(b.lat - a.lat);
    const dLon = this.toRad(b.lon - a.lon);

    const sinHalfLat = Math.sin(dLat / 2);
    const sinHalfLon = Math.sin(dLon / 2);

    const h =
      sinHalfLat * sinHalfLat + Math.cos(this.toRad(a.lat)) * Math.cos(this.toRad(b.lat)) * sinHalfLon * sinHalfLon;

    return 2 * R * Math.asin(Math.sqrt(h));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

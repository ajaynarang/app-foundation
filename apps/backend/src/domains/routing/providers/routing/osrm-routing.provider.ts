import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { EARTH_RADIUS_MILES } from '@sally/shared-types';

import { Configuration } from '../../../../config/configuration';
import {
  DistanceMatrix,
  DistanceMatrixEntry,
  LatLon,
  RouteResult,
  RoutingProvider,
} from './routing-provider.interface';

const METERS_TO_MILES = 0.000621371;
const SECONDS_TO_HOURS = 1 / 3600;
const TRUCK_FACTOR = 1.1;
const ROAD_FACTOR = 1.3;
const AVG_SPEED_MPH = 55;
const TIMEOUT_MS = 30_000;

@Injectable()
export class OSRMRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger(OSRMRoutingProvider.name);
  private readonly client: AxiosInstance;
  private readonly osrmUrl: string;

  constructor(private readonly configService: ConfigService<Configuration, true>) {
    this.osrmUrl = this.configService.get('osrmUrl', { infer: true }) ?? 'http://localhost:5000';

    this.client = axios.create({
      baseURL: this.osrmUrl,
      timeout: TIMEOUT_MS,
    });
  }

  async getDistanceMatrix(stops: LatLon[]): Promise<DistanceMatrix> {
    if (stops.length < 2) {
      return new Map();
    }

    const coords = stops.map((s) => `${s.lon},${s.lat}`).join(';');

    try {
      const response = await this.client.get(`/table/v1/driving/${coords}?annotations=distance,duration`);

      const { distances, durations } = response.data;
      const matrix: DistanceMatrix = new Map();

      for (let i = 0; i < stops.length; i++) {
        for (let j = 0; j < stops.length; j++) {
          if (i === j) continue;

          const fromId = stops[i].id ?? `${i}`;
          const toId = stops[j].id ?? `${j}`;
          const key = `${fromId}:${toId}`;

          const distanceMiles = distances[i][j] * METERS_TO_MILES * TRUCK_FACTOR;
          const driveTimeHours = durations[i][j] * SECONDS_TO_HOURS * TRUCK_FACTOR;

          matrix.set(key, { distanceMiles, driveTimeHours });
        }
      }

      return matrix;
    } catch (error) {
      this.logger.warn(
        `OSRM table request failed, falling back to haversine: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.haversineDistanceMatrix(stops);
    }
  }

  async getRoute(origin: LatLon, destination: LatLon, waypoints?: LatLon[]): Promise<RouteResult> {
    const points = [origin, ...(waypoints ?? []), destination];
    const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');

    try {
      const response = await this.client.get(`/route/v1/driving/${coords}?overview=full&geometries=polyline`);

      const route = response.data.routes[0];
      const resultWaypoints: LatLon[] = response.data.waypoints.map((wp: { location: [number, number] }) => ({
        lon: wp.location[0],
        lat: wp.location[1],
      }));

      return {
        distanceMiles: route.distance * METERS_TO_MILES * TRUCK_FACTOR,
        driveTimeHours: route.duration * SECONDS_TO_HOURS * TRUCK_FACTOR,
        geometry: route.geometry,
        waypoints: resultWaypoints,
      };
    } catch (error) {
      this.logger.warn(
        `OSRM route request failed, falling back to haversine: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.haversineRoute(origin, destination, waypoints);
    }
  }

  // ---------------------------------------------------------------------------
  // Haversine fallback
  // ---------------------------------------------------------------------------

  private haversineDistanceMatrix(stops: LatLon[]): DistanceMatrix {
    const matrix: DistanceMatrix = new Map();

    for (let i = 0; i < stops.length; i++) {
      for (let j = 0; j < stops.length; j++) {
        if (i === j) continue;

        const fromId = stops[i].id ?? `${i}`;
        const toId = stops[j].id ?? `${j}`;
        const key = `${fromId}:${toId}`;

        const entry = this.haversineEntry(stops[i], stops[j]);
        matrix.set(key, entry);
      }
    }

    return matrix;
  }

  private haversineRoute(origin: LatLon, destination: LatLon, waypoints?: LatLon[]): RouteResult {
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
      geometry: '', // no polyline available in fallback
      waypoints: points,
    };
  }

  private haversineEntry(a: LatLon, b: LatLon): DistanceMatrixEntry {
    const straightLineMiles = this.haversineDistance(a, b);
    const distanceMiles = straightLineMiles * ROAD_FACTOR;
    const driveTimeHours = distanceMiles / AVG_SPEED_MPH;

    return { distanceMiles, driveTimeHours };
  }

  /**
   * Calculate the great-circle distance between two points in miles.
   */
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

import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../../platform-services.config';
import { Waypoint } from '../../shared/types';
import { TruckProfile } from '../../routing/routing-provider.interface';
import { IMileageProvider, MileageResult } from '../mileage-provider.interface';

const METERS_TO_MILES = 0.000621371;
const SECONDS_TO_HOURS = 1 / 3600;
const LBS_TO_KG = 0.453592;
const FEET_TO_CM = 30.48;

/**
 * HERE Routing mileage provider — Routing API v8, truck transport mode.
 *
 * Endpoint: GET https://router.hereapi.com/v8/routes
 * Computes practical truck miles + drive hours between two waypoints.
 *
 * Distinct from `HereRoutingProvider` in domains/routing/providers/routing/ —
 * that one serves Smart Routes multi-stop planning. This one is the thin
 * two-waypoint mileage adapter feeding the load-mileage queue. Both call the
 * same v8 endpoint with the same HERE_API_KEY.
 *
 * HERE has no separate "rated miles" product (that's PC*Miler territory) — so
 * rated/practical/shortest all collapse to the single computed distance.
 */
@Injectable()
export class HereMileageProvider implements IMileageProvider {
  private readonly logger = new Logger(HereMileageProvider.name);
  private readonly apiKey: string | undefined;

  private static readonly URL = 'https://router.hereapi.com/v8/routes';

  constructor(private readonly config: PlatformServicesConfig) {
    this.apiKey = config.mileage.apiKey;
  }

  getRatedMiles(origin: Waypoint, destination: Waypoint): Promise<MileageResult> {
    return this.getTruckMiles(origin, destination);
  }

  async getTruckMiles(origin: Waypoint, destination: Waypoint, profile?: TruckProfile): Promise<MileageResult> {
    if (!this.apiKey) {
      throw new Error('HERE API key not configured for mileage');
    }

    const url = this.buildUrl(origin, destination, profile);
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HERE Routing failed: ${response.status}`);
    }

    const data = (await response.json()) as HereRoutingResponse;
    const section = data.routes?.[0]?.sections?.[0];
    const summary = section?.summary;
    if (!summary || summary.length == null || summary.duration == null) {
      throw new Error('HERE Routing returned no route');
    }

    const miles = this.round2(summary.length * METERS_TO_MILES);
    return {
      origin: this.formatWaypoint(origin),
      destination: this.formatWaypoint(destination),
      rated_miles: miles,
      practical_miles: miles,
      shortest_miles: miles,
      duration_hours: this.round2(summary.duration * SECONDS_TO_HOURS),
      provider: 'here',
    };
  }

  private buildUrl(origin: Waypoint, destination: Waypoint, profile?: TruckProfile): URL {
    const url = new URL(HereMileageProvider.URL);
    url.searchParams.set('apiKey', this.apiKey);
    url.searchParams.set('transportMode', 'truck');
    url.searchParams.set('origin', this.formatWaypoint(origin));
    url.searchParams.set('destination', this.formatWaypoint(destination));
    url.searchParams.set('return', 'summary,polyline');

    if (profile?.weight_lbs) {
      url.searchParams.set('vehicle[grossWeight]', String(Math.round(profile.weight_lbs * LBS_TO_KG)));
    }
    if (profile?.height_feet) {
      url.searchParams.set('vehicle[height]', String(Math.round(profile.height_feet * FEET_TO_CM)));
    }
    if (profile?.length_feet) {
      url.searchParams.set('vehicle[length]', String(Math.round(profile.length_feet * FEET_TO_CM)));
    }
    if (profile?.axle_count) {
      url.searchParams.set('vehicle[axleCount]', String(profile.axle_count));
    }
    return url;
  }

  private formatWaypoint(w: Waypoint): string {
    return `${w.latitude},${w.longitude}`;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}

interface HereRoutingResponse {
  routes?: Array<{
    sections?: Array<{
      summary?: { length?: number; duration?: number };
      polyline?: string;
    }>;
  }>;
}

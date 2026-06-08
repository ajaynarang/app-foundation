import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SourcedValue, liveValue, notAvailable } from '@sally/shared-types';

import { Configuration } from '../../../../config/configuration';
import { LatLon, TruckProfile } from '../routing/routing-provider.interface';

const TIMEOUT_MS = 30_000;
const INCHES_TO_CM = 2.54;
const LBS_TO_KG = 0.453592;

/**
 * HERE Tolls via Routing v8 (`return=tolls`). Requires the Tolls add-on on the
 * HERE key. When no toll-capable key is configured, this returns NOT_AVAILABLE
 * (value: null) — it never fabricates a $0 toll. The full request shape is built
 * so flipping to live is just adding the key.
 */
@Injectable()
export class HereTollProvider {
  private readonly logger = new Logger(HereTollProvider.name);
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly tollsEnabled: boolean;

  constructor(private readonly configService: ConfigService<Configuration, true>) {
    // A dedicated tolls key is preferred; fall back to the main HERE key only
    // when tolls are explicitly enabled (the add-on is a paid entitlement).
    this.apiKey = this.configService.get('hereTollsApiKey', { infer: true }) ?? '';
    this.tollsEnabled = Boolean(this.apiKey);

    this.client = axios.create({ baseURL: 'https://router.hereapi.com/v8', timeout: TIMEOUT_MS });

    if (this.tollsEnabled) {
      this.logger.log('HERE Tolls provider initialized (live)');
    } else {
      this.logger.log('HERE Tolls provider initialized (NOT_AVAILABLE — no tolls key configured)');
    }
  }

  async estimateRouteToll(waypoints: LatLon[], truckProfile?: TruckProfile): Promise<SourcedValue> {
    if (!this.tollsEnabled || waypoints.length < 2) {
      return notAvailable('Connect a HERE Tolls subscription for live toll costs');
    }

    try {
      const origin = waypoints[0];
      const destination = waypoints[waypoints.length - 1];
      const via = waypoints.slice(1, -1);

      const params: Record<string, string> = {
        apiKey: this.apiKey,
        transportMode: 'truck',
        origin: `${origin.lat},${origin.lon}`,
        destination: `${destination.lat},${destination.lon}`,
        return: 'summary,tolls',
        currency: 'USD',
        ...this.buildVehicleParams(truckProfile),
      };
      via.forEach((wp, i) => {
        params[`via${i > 0 ? i : ''}`] = `${wp.lat},${wp.lon}`;
      });

      const response = await this.client.get('/routes', { params });
      const route = response.data?.routes?.[0];
      if (!route) return notAvailable('No toll data returned for this route');

      const costCents = this.sumTollSections(route);
      return liveValue(costCents, new Date(), 'HERE Tolls');
    } catch (error) {
      this.logger.warn(
        `HERE Tolls request failed, reporting NOT_AVAILABLE: ${error instanceof Error ? error.message : String(error)}`,
      );
      return notAvailable('Toll lookup is temporarily unavailable');
    }
  }

  /** Sum every section's toll fares (HERE returns fares in major currency units). */
  private sumTollSections(route: {
    sections?: Array<{ tolls?: Array<{ fares?: Array<{ price?: { value?: number } }> }> }>;
  }): number {
    let totalDollars = 0;
    for (const section of route.sections ?? []) {
      for (const toll of section.tolls ?? []) {
        for (const fare of toll.fares ?? []) {
          totalDollars += fare.price?.value ?? 0;
        }
      }
    }
    return Math.round(totalDollars * 100);
  }

  private buildVehicleParams(profile?: TruckProfile): Record<string, string> {
    const params: Record<string, string> = {};
    if (!profile) return params;
    if (profile.grossWeightLbs) params['vehicle[grossWeight]'] = String(Math.round(profile.grossWeightLbs * LBS_TO_KG));
    if (profile.heightInches) params['vehicle[height]'] = String(Math.round(profile.heightInches * INCHES_TO_CM));
    if (profile.axleCount) params['truck[axleCount]'] = String(profile.axleCount);
    return params;
  }
}

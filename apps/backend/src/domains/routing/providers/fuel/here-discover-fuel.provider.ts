import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EARTH_RADIUS_MILES } from '@sally/shared-types';

import { FuelDataProvider, FuelStop, FuelStopFilter } from './fuel-data-provider.interface';
const MILES_TO_METERS = 1609.34;

/**
 * Known truck stop brand names extracted from HERE place titles.
 * Used to normalize brand for fuel card filtering.
 */
const KNOWN_BRANDS: Record<string, string> = {
  pilot: 'Pilot',
  'flying j': 'Flying J',
  "love's": "Love's",
  loves: "Love's",
  ta: 'TA',
  'travel america': 'TA',
  travelamerica: 'TA',
  petro: 'Petro',
  "casey's": "Casey's",
  caseys: "Casey's",
  sheetz: 'Sheetz',
  wawa: 'Wawa',
  quiktrip: 'QuikTrip',
  qt: 'QuikTrip',
  "buc-ee's": "Buc-ee's",
  bucees: "Buc-ee's",
  'road ranger': 'Road Ranger',
  ambest: 'AmBest',
  speedway: 'Speedway',
  'circle k': 'Circle K',
  sapp: 'Sapp Bros',
  'kenly 95': 'Kenly 95',
};

interface HEREPlace {
  id: string;
  title: string;
  position: { lat: number; lng: number };
  address?: {
    city?: string;
    stateCode?: string;
    state?: string;
    countryCode?: string;
  };
  distance?: number; // meters from search point
  categories?: Array<{ id: string; name: string }>;
}

interface HEREDiscoverResponse {
  items: HEREPlace[];
}

@Injectable()
export class HEREDiscoverFuelProvider implements FuelDataProvider {
  private readonly logger = new Logger(HEREDiscoverFuelProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://discover.search.hereapi.com/v1/discover';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('HERE_API_KEY', '');
  }

  async findFuelStopsNearPoint(
    lat: number,
    lon: number,
    radiusMiles: number,
    filter?: FuelStopFilter,
  ): Promise<FuelStop[]> {
    this.logger.debug(`Finding fuel stops near (${lat}, ${lon}) within ${radiusMiles} miles via HERE Discover`);

    const radiusMeters = Math.round(radiusMiles * MILES_TO_METERS);
    const places = await this.discoverPlaces(
      'truck stop fuel station',
      { lat, lon },
      `circle:${lat},${lon};r=${radiusMeters}`,
      20,
    );

    return this.mapAndFilter(places, lat, lon, filter);
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
      `Finding fuel stops along corridor (${fromLat},${fromLon}) -> (${toLat},${toLon}), width ${corridorWidthMiles}mi via HERE Discover`,
    );

    // HERE corridor search needs a polyline. Use a simple 2-point polyline.
    // The `route` param accepts a flexible polyline, but for discovery
    // we'll use `in=bbox` covering the bounding box of the corridor.
    const minLat = Math.min(fromLat, toLat) - corridorWidthMiles / 69;
    const maxLat = Math.max(fromLat, toLat) + corridorWidthMiles / 69;
    const minLon =
      Math.min(fromLon, toLon) - corridorWidthMiles / (69 * Math.cos((((fromLat + toLat) / 2) * Math.PI) / 180));
    const maxLon =
      Math.max(fromLon, toLon) + corridorWidthMiles / (69 * Math.cos((((fromLat + toLat) / 2) * Math.PI) / 180));

    const midLat = (fromLat + toLat) / 2;
    const midLon = (fromLon + toLon) / 2;

    const places = await this.discoverPlaces(
      'truck stop fuel station',
      { lat: midLat, lon: midLon },
      `bbox:${minLon},${minLat},${maxLon},${maxLat}`,
      20,
    );

    // Filter to stops actually within corridor width
    const filtered = places.filter((p) => {
      const dist = this.pointToSegmentDistance(p.position.lat, p.position.lng, fromLat, fromLon, toLat, toLon);
      return dist <= corridorWidthMiles;
    });

    return this.mapAndFilter(filtered, fromLat, fromLon, filter);
  }

  /**
   * Find truck stops with parking near a point (for rest stops).
   */
  async findRestStopsNearPoint(lat: number, lon: number, radiusMiles: number): Promise<FuelStop[]> {
    const radiusMeters = Math.round(radiusMiles * MILES_TO_METERS);
    const places = await this.discoverPlaces(
      'truck stop truck parking rest area',
      { lat, lon },
      `circle:${lat},${lon};r=${radiusMeters}`,
      10,
    );

    return this.mapAndFilter(places, lat, lon);
  }

  /**
   * Find truck stops that offer both fuel and parking (combined stops).
   */
  async findTruckStopsNearPoint(
    lat: number,
    lon: number,
    radiusMiles: number,
    filter?: FuelStopFilter,
  ): Promise<FuelStop[]> {
    const radiusMeters = Math.round(radiusMiles * MILES_TO_METERS);
    const places = await this.discoverPlaces('truck stop', { lat, lon }, `circle:${lat},${lon};r=${radiusMeters}`, 10);

    // Major truck stops (Pilot, Love's, TA, etc.) have both fuel and parking
    const majorBrands = new Set(['Pilot', 'Flying J', "Love's", 'TA', 'Petro', "Buc-ee's"]);
    const combined = places.filter((p) => {
      const brand = this.extractBrand(p.title);
      return majorBrands.has(brand) || p.title.toLowerCase().includes('truck stop');
    });

    return this.mapAndFilter(combined.length > 0 ? combined : places, lat, lon, filter);
  }

  // ─── Private Helpers ─────────────────────────────────────────────

  private async discoverPlaces(
    query: string,
    at: { lat: number; lon: number },
    inParam: string,
    limit: number,
  ): Promise<HEREPlace[]> {
    if (!this.apiKey) {
      this.logger.warn('HERE_API_KEY not configured, returning empty results');
      return [];
    }

    try {
      const response = await axios.get<HEREDiscoverResponse>(this.baseUrl, {
        params: {
          q: query,
          at: `${at.lat},${at.lon}`,
          in: inParam,
          limit,
          apiKey: this.apiKey,
        },
        timeout: 10000,
      });

      return response.data.items ?? [];
    } catch (err: any) {
      this.logger.error(`HERE Discover API error: ${err.response?.status} ${err.message}`);
      return [];
    }
  }

  private mapAndFilter(places: HEREPlace[], refLat: number, refLon: number, filter?: FuelStopFilter): FuelStop[] {
    let stops: FuelStop[] = places.map((place) => ({
      stopId: place.id,
      name: place.title,
      lat: place.position.lat,
      lon: place.position.lng,
      city: place.address?.city ?? '',
      state: place.address?.stateCode ?? place.address?.state ?? '',
      brand: this.extractBrand(place.title),
      fuelPricePerGallon: 0, // Pricing handled by FuelPricingService
      amenities: (place.categories ?? []).map((c) => c.name),
      distanceFromRoute: place.distance
        ? place.distance / MILES_TO_METERS
        : this.haversine(refLat, refLon, place.position.lat, place.position.lng),
    }));

    // Filter by accepted brands if configured
    if (filter?.acceptedBrands && filter.acceptedBrands.length > 0) {
      const acceptedSet = new Set(filter.acceptedBrands.map((b) => b.toLowerCase()));
      stops = stops.filter((s) => s.brand === 'Independent' || acceptedSet.has(s.brand.toLowerCase()));
    }

    // Sort by distance from route (nearest first for HERE results)
    stops.sort((a, b) => a.distanceFromRoute - b.distanceFromRoute);

    return stops;
  }

  /**
   * Extract a known brand name from a place title.
   * e.g. "Pilot Travel Center #421" → "Pilot"
   */
  private extractBrand(title: string): string {
    const lower = title.toLowerCase();
    for (const [key, brand] of Object.entries(KNOWN_BRANDS)) {
      if (lower.includes(key)) return brand;
    }
    return 'Independent';
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const sinHalfLat = Math.sin(dLat / 2);
    const sinHalfLon = Math.sin(dLon / 2);
    const a =
      sinHalfLat * sinHalfLat + Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * sinHalfLon * sinHalfLon;
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
  }

  private pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const segLenSq = dx * dx + dy * dy;
    if (segLenSq === 0) return this.haversine(px, py, ax, ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLenSq));
    return this.haversine(px, py, ax + t * dx, ay + t * dy);
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

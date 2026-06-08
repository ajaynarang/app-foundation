import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../../platform-services.config';
import { IGeocodingProvider, GeocodingResult } from '../geocoding-provider.interface';

/**
 * HERE Geocoding Provider
 *
 * Implements IGeocodingProvider using the HERE Geocoding & Search API v1.
 * API docs: https://developer.here.com/documentation/geocoding-search-api
 *
 * Uses the same HERE_API_KEY as routing, traffic, and tolls.
 */
@Injectable()
export class HereGeocodingProvider implements IGeocodingProvider {
  private readonly logger = new Logger(HereGeocodingProvider.name);
  private readonly apiKey: string | undefined;

  private static readonly GEOCODE_URL = 'https://geocode.search.hereapi.com/v1/geocode';
  private static readonly REVERSE_GEOCODE_URL = 'https://revgeocode.search.hereapi.com/v1/revgeocode';

  constructor(private readonly config: PlatformServicesConfig) {
    this.apiKey = config.geocoding.apiKey;
  }

  async geocode(address: string): Promise<GeocodingResult[]> {
    if (!this.apiKey) {
      this.logger.warn('HERE API key not configured — skipping geocode');
      return [];
    }

    try {
      const url = new URL(HereGeocodingProvider.GEOCODE_URL);
      url.searchParams.set('q', address);
      url.searchParams.set('apiKey', this.apiKey);
      url.searchParams.set('limit', '1');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        this.logger.error(`HERE Geocode API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      return this.mapItems(data.items ?? []);
    } catch (error) {
      this.logger.error(`HERE Geocode request failed: ${error}`);
      return [];
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult> {
    if (!this.apiKey) {
      this.logger.warn('HERE API key not configured — returning fallback reverse geocode');
      return this.fallbackResult(latitude, longitude);
    }

    try {
      const url = new URL(HereGeocodingProvider.REVERSE_GEOCODE_URL);
      url.searchParams.set('at', `${latitude},${longitude}`);
      url.searchParams.set('apiKey', this.apiKey);
      url.searchParams.set('limit', '1');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        this.logger.error(`HERE Reverse Geocode API error: ${response.status} ${response.statusText}`);
        return this.fallbackResult(latitude, longitude);
      }

      const data = await response.json();
      const items = this.mapItems(data.items ?? []);
      return items[0] ?? this.fallbackResult(latitude, longitude);
    } catch (error) {
      this.logger.error(`HERE Reverse Geocode request failed: ${error}`);
      return this.fallbackResult(latitude, longitude);
    }
  }

  private mapItems(items: HereGeocodingItem[]): GeocodingResult[] {
    return items.map((item) => ({
      latitude: item.position.lat,
      longitude: item.position.lng,
      formatted_address: item.address?.label ?? '',
      city: item.address?.city,
      state: item.address?.stateCode,
      zip: item.address?.postalCode,
      country: item.address?.countryCode,
      confidence: item.scoring?.queryScore ?? 0.5,
    }));
  }

  private fallbackResult(latitude: number, longitude: number): GeocodingResult {
    return {
      latitude,
      longitude,
      formatted_address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      confidence: 0,
    };
  }
}

/** Shape of an item from the HERE Geocoding & Search API response */
interface HereGeocodingItem {
  position: { lat: number; lng: number };
  address?: {
    label?: string;
    city?: string;
    stateCode?: string;
    postalCode?: string;
    countryCode?: string;
  };
  scoring?: {
    queryScore?: number;
  };
}

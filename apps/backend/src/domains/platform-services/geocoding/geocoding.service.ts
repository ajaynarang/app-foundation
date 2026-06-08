import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { IGeocodingProvider, GeocodingResult } from './geocoding-provider.interface';
import { HereGeocodingProvider } from './providers/here-geocoding.provider';

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly provider: IGeocodingProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly hereGeocoding: HereGeocodingProvider,
  ) {
    this.provider = this.resolveProvider(config.geocoding.provider);
  }

  private resolveProvider(name: string): IGeocodingProvider {
    const providers: Record<string, IGeocodingProvider> = {
      here: this.hereGeocoding,
    };
    return providers[name] ?? this.hereGeocoding;
  }

  async geocode(address: string): Promise<GeocodingResult[]> {
    return this.health.withHealthTracking('geocoding', () => this.provider.geocode(address));
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult> {
    return this.health.withHealthTracking('geocoding', () => this.provider.reverseGeocode(latitude, longitude));
  }

  /**
   * Geocode a stop's address fields into coordinates.
   * Returns the best result or null if geocoding fails / no results.
   * Best-effort — never throws.
   */
  async geocodeStop(fields: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    name?: string | null;
  }): Promise<GeocodingResult | null> {
    const parts = [fields.address, fields.city, fields.state, fields.zipCode].filter(Boolean);

    if (parts.length === 0) {
      if (!fields.name) return null;
      parts.push(fields.name);
    }

    const query = parts.join(', ');

    try {
      const results = await this.geocode(query);
      return results[0] ?? null;
    } catch (error) {
      this.logger.warn(`Failed to geocode stop: ${query} — ${error}`);
      return null;
    }
  }
}

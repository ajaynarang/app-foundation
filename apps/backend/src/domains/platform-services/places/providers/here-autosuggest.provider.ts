import { Injectable, Logger } from '@nestjs/common';
import type { PlaceSuggestion } from '@sally/shared-types';
import { PlatformServicesConfig } from '../../platform-services.config';
import type { AutocompleteParams, IPlacesProvider } from '../places-provider.interface';

/**
 * HERE Autosuggest Provider — Geocoding & Search API v1.
 *
 * Endpoint: GET https://autosuggest.search.hereapi.com/v1/autosuggest
 * Returns ranked address + place suggestions with inline coordinates.
 * Docs: https://developer.here.com/documentation/geocoding-search-api
 *
 * Uses the same HERE_API_KEY as geocoding, routing, traffic, and tolls.
 */
@Injectable()
export class HereAutosuggestProvider implements IPlacesProvider {
  private readonly logger = new Logger(HereAutosuggestProvider.name);
  private readonly apiKey: string | undefined;

  private static readonly AUTOSUGGEST_URL = 'https://autosuggest.search.hereapi.com/v1/autosuggest';
  private static readonly DEFAULT_LIMIT = 5;
  private static readonly DEFAULT_CENTER = '39.8283,-98.5795'; // US geographic center
  private static readonly DEFAULT_COUNTRY_FILTER = 'countryCode:USA';

  constructor(private readonly config: PlatformServicesConfig) {
    this.apiKey = config.places.apiKey;
  }

  async autocomplete(params: AutocompleteParams): Promise<PlaceSuggestion[]> {
    if (!this.apiKey) {
      this.logger.warn('HERE API key not configured — skipping autosuggest');
      return [];
    }

    try {
      const url = this.buildUrl(params);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        this.logger.error(`HERE Autosuggest API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as HereAutosuggestResponse;
      return this.mapItems(data.items ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`HERE Autosuggest request failed: ${message}`);
      return [];
    }
  }

  private buildUrl(params: AutocompleteParams): URL {
    const url = new URL(HereAutosuggestProvider.AUTOSUGGEST_URL);
    url.searchParams.set('q', params.q);
    url.searchParams.set('at', HereAutosuggestProvider.DEFAULT_CENTER);
    url.searchParams.set('in', HereAutosuggestProvider.DEFAULT_COUNTRY_FILTER);
    url.searchParams.set('limit', String(params.limit ?? HereAutosuggestProvider.DEFAULT_LIMIT));
    url.searchParams.set('apiKey', this.apiKey ?? '');
    if (params.sessionToken) {
      url.searchParams.set('sessionToken', params.sessionToken);
    }
    return url;
  }

  private mapItems(items: HereAutosuggestItem[]): PlaceSuggestion[] {
    return items.filter((item) => this.isUsResult(item)).map((item) => this.mapItem(item));
  }

  private isUsResult(item: HereAutosuggestItem): boolean {
    const country = item.address?.countryCode;
    return !country || country === 'USA';
  }

  private mapItem(item: HereAutosuggestItem): PlaceSuggestion {
    return {
      externalId: item.id,
      text: item.title,
      street: item.address?.street,
      city: item.address?.city,
      state: item.address?.stateCode,
      zipCode: this.normalizePostal(item.address?.postalCode),
      lat: item.position?.lat,
      lon: item.position?.lng,
      provider: 'here',
    };
  }

  private normalizePostal(postal: string | undefined): string | undefined {
    if (!postal) return undefined;
    return postal.split('-')[0] ?? postal;
  }
}

interface HereAutosuggestItem {
  id: string;
  title: string;
  position?: { lat: number; lng: number };
  address?: {
    label?: string;
    street?: string;
    city?: string;
    stateCode?: string;
    postalCode?: string;
    countryCode?: string;
  };
  resultType?: string;
}

interface HereAutosuggestResponse {
  items?: HereAutosuggestItem[];
}

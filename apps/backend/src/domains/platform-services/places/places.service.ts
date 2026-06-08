import { Injectable, Logger } from '@nestjs/common';
import type { PlaceSuggestion } from '@sally/shared-types';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { PlatformHealthService } from '../platform-health.service';
import { PlatformServicesConfig } from '../platform-services.config';
import type { AutocompleteParams, IPlacesProvider } from './places-provider.interface';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { HereAutosuggestProvider } from './providers/here-autosuggest.provider';
import { SmartyPlacesProvider } from './providers/smarty-places.provider';

const HEALTH_KEY = 'places';
const CACHE_PREFIX = 'sally:places';
const DEFAULT_LIMIT = 5;
const DEFAULT_COUNTRY = 'US';
const MIN_QUERY_LENGTH = 3;

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly provider: IPlacesProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly cache: SallyCacheService,
    private readonly hereProvider: HereAutosuggestProvider,
    private readonly googleProvider: GooglePlacesProvider,
    private readonly smartyProvider: SmartyPlacesProvider,
  ) {
    this.provider = this.resolveProvider(config.places.provider);
  }

  private resolveProvider(name: string): IPlacesProvider {
    const providers: Record<string, IPlacesProvider> = {
      here: this.hereProvider,
      google: this.googleProvider,
      smarty: this.smartyProvider,
    };
    const resolved = providers[name];
    if (!resolved) {
      this.logger.warn(`Unknown places provider '${name}', falling back to HERE`);
      return this.hereProvider;
    }
    return resolved;
  }

  async autocomplete(tenantId: number, params: AutocompleteParams): Promise<PlaceSuggestion[]> {
    if (!this.config.places.configured) return [];

    const normalized = params.q.trim().toLowerCase();
    if (normalized.length < MIN_QUERY_LENGTH) return [];

    const country = params.country ?? DEFAULT_COUNTRY;
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cacheKey = buildKey(CACHE_PREFIX, 'auto', tenantId, country, limit, normalized);

    return this.cache.getOrSet<PlaceSuggestion[]>(
      cacheKey,
      () => this.health.withHealthTracking(HEALTH_KEY, () => this.provider.autocomplete(params)),
      CACHE_TTL_WARM_5M,
    );
  }
}

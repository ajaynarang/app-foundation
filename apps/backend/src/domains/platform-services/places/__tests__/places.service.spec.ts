import { Test, TestingModule } from '@nestjs/testing';
import { NotImplementedException } from '@nestjs/common';
import type { PlaceSuggestion } from '@sally/shared-types';
import { PlacesService } from '../places.service';
import { HereAutosuggestProvider } from '../providers/here-autosuggest.provider';
import { GooglePlacesProvider } from '../providers/google-places.provider';
import { SmartyPlacesProvider } from '../providers/smarty-places.provider';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';

describe('PlacesService', () => {
  let service: PlacesService;
  let hereProvider: { autocomplete: jest.Mock };
  let googleProvider: { autocomplete: jest.Mock };
  let smartyProvider: { autocomplete: jest.Mock };
  let healthService: any;
  let cache: { getOrSet: jest.Mock };

  const mockSuggestion: PlaceSuggestion = {
    externalId: 'here:af:abc',
    text: 'Walmart DC #6094, Bentonville, AR',
    street: '1234 Industrial Blvd',
    city: 'Bentonville',
    state: 'AR',
    zipCode: '72712',
    lat: 36.3729,
    lon: -94.2088,
    provider: 'here',
  };

  function buildModule(provider: 'here' | 'google' | 'smarty' = 'here') {
    return Test.createTestingModule({
      providers: [
        PlacesService,
        { provide: HereAutosuggestProvider, useValue: hereProvider },
        { provide: GooglePlacesProvider, useValue: googleProvider },
        { provide: SmartyPlacesProvider, useValue: smartyProvider },
        {
          provide: PlatformServicesConfig,
          useValue: {
            places: { provider, apiKey: 'test-key', configured: true },
          },
        },
        { provide: PlatformHealthService, useValue: healthService },
        { provide: SallyCacheService, useValue: cache },
      ],
    }).compile();
  }

  beforeEach(() => {
    hereProvider = { autocomplete: jest.fn().mockResolvedValue([mockSuggestion]) };
    googleProvider = {
      autocomplete: jest.fn().mockRejectedValue(new NotImplementedException()),
    };
    smartyProvider = {
      autocomplete: jest.fn().mockRejectedValue(new NotImplementedException()),
    };
    healthService = {
      withHealthTracking: jest.fn().mockImplementation(async (_n, fn) => fn()),
    };
    cache = {
      getOrSet: jest.fn().mockImplementation(async (_key, fn) => fn()),
    };
  });

  describe('autocomplete', () => {
    it('routes to HERE provider by default', async () => {
      const module: TestingModule = await buildModule('here');
      service = module.get(PlacesService);

      const results = await service.autocomplete(1, { q: 'walmart' });

      expect(results).toEqual([mockSuggestion]);
      expect(hereProvider.autocomplete).toHaveBeenCalledWith({ q: 'walmart' });
      expect(googleProvider.autocomplete).not.toHaveBeenCalled();
    });

    it('records success via health tracker', async () => {
      const module: TestingModule = await buildModule('here');
      service = module.get(PlacesService);

      await service.autocomplete(1, { q: 'walmart' });

      expect(healthService.withHealthTracking).toHaveBeenCalledWith('places', expect.any(Function));
    });

    it('caches results keyed by tenant + country + limit + normalized query', async () => {
      const module: TestingModule = await buildModule('here');
      service = module.get(PlacesService);

      await service.autocomplete(42, { q: '  Walmart  ', country: 'US', limit: 7 });

      expect(cache.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining('42'),
        expect.any(Function),
        expect.any(Number),
      );
      const [key] = cache.getOrSet.mock.calls[0];
      expect(key).toContain('walmart'); // normalized lowercase
      expect(key).not.toContain('Walmart');
      expect(key).toContain('US');
      expect(key).toContain('7');
    });

    it('uses different cache keys for different limits (no collision)', async () => {
      const module: TestingModule = await buildModule('here');
      service = module.get(PlacesService);

      await service.autocomplete(42, { q: 'walmart', limit: 5 });
      await service.autocomplete(42, { q: 'walmart', limit: 10 });

      const [keyA] = cache.getOrSet.mock.calls[0];
      const [keyB] = cache.getOrSet.mock.calls[1];
      expect(keyA).not.toBe(keyB);
    });

    it('returns empty array when normalized q is shorter than 3 chars', async () => {
      const module: TestingModule = await buildModule('here');
      service = module.get(PlacesService);

      const results = await service.autocomplete(1, { q: '  ab  ' });
      expect(results).toEqual([]);
      expect(cache.getOrSet).not.toHaveBeenCalled();
      expect(hereProvider.autocomplete).not.toHaveBeenCalled();
    });

    it('falls back to HERE when an unknown provider is configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PlacesService,
          { provide: HereAutosuggestProvider, useValue: hereProvider },
          { provide: GooglePlacesProvider, useValue: googleProvider },
          { provide: SmartyPlacesProvider, useValue: smartyProvider },
          {
            provide: PlatformServicesConfig,
            useValue: { places: { provider: 'mapbox', apiKey: 'k', configured: true } },
          },
          { provide: PlatformHealthService, useValue: healthService },
          { provide: SallyCacheService, useValue: cache },
        ],
      }).compile();
      service = module.get(PlacesService);

      await service.autocomplete(1, { q: 'walmart' });

      expect(hereProvider.autocomplete).toHaveBeenCalled();
    });

    it('throws NotImplementedException when google provider is selected', async () => {
      const module: TestingModule = await buildModule('google');
      service = module.get(PlacesService);

      await expect(service.autocomplete(1, { q: 'walmart' })).rejects.toThrow(NotImplementedException);
    });

    it('returns empty array when provider is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PlacesService,
          { provide: HereAutosuggestProvider, useValue: hereProvider },
          { provide: GooglePlacesProvider, useValue: googleProvider },
          { provide: SmartyPlacesProvider, useValue: smartyProvider },
          {
            provide: PlatformServicesConfig,
            useValue: { places: { provider: 'here', apiKey: undefined, configured: false } },
          },
          { provide: PlatformHealthService, useValue: healthService },
          { provide: SallyCacheService, useValue: cache },
        ],
      }).compile();
      service = module.get(PlacesService);

      const results = await service.autocomplete(1, { q: 'walmart' });
      expect(results).toEqual([]);
      expect(hereProvider.autocomplete).not.toHaveBeenCalled();
    });
  });
});

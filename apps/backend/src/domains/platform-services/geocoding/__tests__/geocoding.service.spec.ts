import { Test, TestingModule } from '@nestjs/testing';
import { GeocodingService } from '../geocoding.service';
import { HereGeocodingProvider } from '../providers/here-geocoding.provider';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { GeocodingResult } from '../geocoding-provider.interface';

describe('GeocodingService', () => {
  let service: GeocodingService;
  let hereProvider: { geocode: jest.Mock; reverseGeocode: jest.Mock };
  let healthService: any;

  const mockGeocodingResult: GeocodingResult = {
    latitude: 32.7767,
    longitude: -96.797,
    formatted_address: '1234 Main St, Dallas, TX 75201',
    city: 'Dallas',
    state: 'TX',
    zip: '75201',
    country: 'US',
    confidence: 0.95,
  };

  beforeEach(async () => {
    hereProvider = {
      geocode: jest.fn().mockResolvedValue([mockGeocodingResult]),
      reverseGeocode: jest.fn().mockResolvedValue(mockGeocodingResult),
    };

    healthService = {
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordError: jest.fn().mockResolvedValue(undefined),
      withHealthTracking: jest.fn().mockImplementation(async (_service, fn) => {
        const start = Date.now();
        try {
          const result = await fn();
          await healthService.recordSuccess(_service, Date.now() - start);
          return result;
        } catch (error) {
          await healthService.recordError(_service, error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeocodingService,
        {
          provide: HereGeocodingProvider,
          useValue: hereProvider,
        },
        {
          provide: PlatformServicesConfig,
          useValue: {
            geocoding: {
              provider: 'here',
              apiKey: 'test-key',
              configured: true,
            },
          },
        },
        {
          provide: PlatformHealthService,
          useValue: healthService,
        },
      ],
    }).compile();

    service = module.get(GeocodingService);
  });

  describe('geocode', () => {
    it('should return geocoding results from the provider', async () => {
      const results = await service.geocode('Dallas, TX');
      expect(results).toEqual([mockGeocodingResult]);
      expect(hereProvider.geocode).toHaveBeenCalledWith('Dallas, TX');
    });

    it('should record success in health service', async () => {
      await service.geocode('Dallas, TX');
      expect(healthService.recordSuccess).toHaveBeenCalledWith('geocoding', expect.any(Number));
    });

    it('should record error in health service on failure', async () => {
      const error = new Error('Geocoding API timeout');
      hereProvider.geocode.mockRejectedValue(error);

      await expect(service.geocode('Invalid Address')).rejects.toThrow('Geocoding API timeout');
      expect(healthService.recordError).toHaveBeenCalledWith('geocoding', error);
    });

    it('should wrap non-Error exceptions in Error objects for health recording', async () => {
      hereProvider.geocode.mockRejectedValue('string error');

      await expect(service.geocode('Bad Address')).rejects.toBe('string error');
      expect(healthService.recordError).toHaveBeenCalledWith('geocoding', expect.any(Error));
    });
  });

  describe('reverseGeocode', () => {
    it('should return a geocoding result from coordinates', async () => {
      const result = await service.reverseGeocode(32.7767, -96.797);
      expect(result).toEqual(mockGeocodingResult);
      expect(hereProvider.reverseGeocode).toHaveBeenCalledWith(32.7767, -96.797);
    });

    it('should record success in health service', async () => {
      await service.reverseGeocode(32.7767, -96.797);
      expect(healthService.recordSuccess).toHaveBeenCalledWith('geocoding', expect.any(Number));
    });

    it('should record error in health service on failure', async () => {
      const error = new Error('Reverse geocoding failed');
      hereProvider.reverseGeocode.mockRejectedValue(error);

      await expect(service.reverseGeocode(0, 0)).rejects.toThrow('Reverse geocoding failed');
      expect(healthService.recordError).toHaveBeenCalledWith('geocoding', error);
    });
  });

  // ─── geocodeStop ────────────────────────────────────────────────────────

  describe('geocodeStop', () => {
    it('should geocode a stop from address fields', async () => {
      const result = await service.geocodeStop({
        address: '1234 Main St',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75201',
        name: 'Warehouse',
      });

      expect(result).toEqual(mockGeocodingResult);
      expect(hereProvider.geocode).toHaveBeenCalledWith('1234 Main St, Dallas, TX, 75201');
    });

    it('should fall back to name when all address fields are empty', async () => {
      const result = await service.geocodeStop({
        address: null,
        city: null,
        state: null,
        zipCode: null,
        name: 'Distribution Center',
      });

      expect(result).toEqual(mockGeocodingResult);
      expect(hereProvider.geocode).toHaveBeenCalledWith('Distribution Center');
    });

    it('should return null when no address fields and no name', async () => {
      const result = await service.geocodeStop({
        address: null,
        city: null,
        state: null,
        zipCode: null,
        name: null,
      });

      expect(result).toBeNull();
      expect(hereProvider.geocode).not.toHaveBeenCalled();
    });

    it('should return null when geocoding returns empty array', async () => {
      hereProvider.geocode.mockResolvedValue([]);

      const result = await service.geocodeStop({
        address: 'Unknown Address',
        city: null,
        state: null,
        zipCode: null,
        name: null,
      });

      expect(result).toBeNull();
    });

    it('should return null on geocoding error (never throws)', async () => {
      hereProvider.geocode.mockRejectedValue(new Error('API failure'));

      const result = await service.geocodeStop({
        address: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75201',
        name: null,
      });

      expect(result).toBeNull();
    });

    it('should filter out null/empty address fields', async () => {
      await service.geocodeStop({
        address: '123 Main St',
        city: null,
        state: 'TX',
        zipCode: null,
        name: 'Test',
      });

      expect(hereProvider.geocode).toHaveBeenCalledWith('123 Main St, TX');
    });
  });

  describe('provider resolution', () => {
    it('should default to HERE provider for unknown provider names', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeocodingService,
          {
            provide: HereGeocodingProvider,
            useValue: hereProvider,
          },
          {
            provide: PlatformServicesConfig,
            useValue: {
              geocoding: {
                provider: 'nonexistent',
                apiKey: 'test-key',
                configured: true,
              },
            },
          },
          {
            provide: PlatformHealthService,
            useValue: healthService,
          },
        ],
      }).compile();

      const fallbackService = module.get(GeocodingService);
      const results = await fallbackService.geocode('Dallas, TX');
      expect(results).toEqual([mockGeocodingResult]);
      expect(hereProvider.geocode).toHaveBeenCalled();
    });
  });
});

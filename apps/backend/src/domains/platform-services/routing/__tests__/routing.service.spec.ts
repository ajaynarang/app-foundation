import { Test, TestingModule } from '@nestjs/testing';
import { RoutingService } from '../routing.service';
import { HereMapsProvider } from '../providers/here-maps.provider';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { RouteResult, Waypoint } from '../routing-provider.interface';

describe('RoutingService', () => {
  let service: RoutingService;
  let hereMaps: jest.Mocked<HereMapsProvider>;
  let health: any;

  const mockOrigin: Waypoint = { latitude: 32.7767, longitude: -96.797 };
  const mockDestination: Waypoint = { latitude: 29.7604, longitude: -95.3698 };

  const mockRouteResult: RouteResult = {
    distance_miles: 239.56,
    duration_minutes: 261.38,
    polyline: 'mock_polyline:32.77670,-96.79700;29.76040,-95.36980',
    waypoints: [mockOrigin, mockDestination],
    segments: [
      {
        start: mockOrigin,
        end: mockDestination,
        distance_miles: 239.56,
        duration_minutes: 261.38,
      },
    ],
  };

  beforeEach(async () => {
    hereMaps = {
      getRoute: jest.fn().mockResolvedValue(mockRouteResult),
      getTruckRoute: jest.fn().mockResolvedValue({
        ...mockRouteResult,
        distance_miles: 263.52,
        duration_minutes: 300.59,
      }),
    } as unknown as jest.Mocked<HereMapsProvider>;

    health = {
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordError: jest.fn().mockResolvedValue(undefined),
      withHealthTracking: jest.fn().mockImplementation(async (_service: string, fn: () => Promise<any>) => {
        const start = Date.now();
        try {
          const result = await fn();
          await health.recordSuccess(_service, Date.now() - start);
          return result;
        } catch (error) {
          await health.recordError(_service, error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }),
    };

    const config = {
      routing: { provider: 'here', apiKey: 'test-key', configured: true },
    } as unknown as PlatformServicesConfig;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutingService,
        { provide: HereMapsProvider, useValue: hereMaps },
        { provide: PlatformServicesConfig, useValue: config },
        { provide: PlatformHealthService, useValue: health },
      ],
    }).compile();

    service = module.get(RoutingService);
  });

  describe('getRoute', () => {
    it('should return route result from provider', async () => {
      const result = await service.getRoute(mockOrigin, mockDestination);

      expect(result).toEqual(mockRouteResult);
      expect(hereMaps.getRoute).toHaveBeenCalledWith(mockOrigin, mockDestination, undefined);
    });

    it('should pass waypoints to provider', async () => {
      const waypoints: Waypoint[] = [{ latitude: 31.5, longitude: -96.0 }];
      await service.getRoute(mockOrigin, mockDestination, waypoints);

      expect(hereMaps.getRoute).toHaveBeenCalledWith(mockOrigin, mockDestination, waypoints);
    });

    it('should record success in health service', async () => {
      await service.getRoute(mockOrigin, mockDestination);

      expect(health.recordSuccess).toHaveBeenCalledWith('routing', expect.any(Number));
    });

    it('should record error in health service on failure', async () => {
      const error = new Error('HERE API timeout');
      hereMaps.getRoute.mockRejectedValue(error);

      await expect(service.getRoute(mockOrigin, mockDestination)).rejects.toThrow('HERE API timeout');

      expect(health.recordError).toHaveBeenCalledWith('routing', error);
    });

    it('should wrap non-Error objects in Error', async () => {
      hereMaps.getRoute.mockRejectedValue('string error');

      await expect(service.getRoute(mockOrigin, mockDestination)).rejects.toBe('string error');

      expect(health.recordError).toHaveBeenCalledWith('routing', expect.objectContaining({ message: 'string error' }));
    });
  });

  describe('getTruckRoute', () => {
    it('should return truck route result from provider', async () => {
      const result = await service.getTruckRoute(mockOrigin, mockDestination);

      expect(result.distance_miles).toBe(263.52);
      expect(hereMaps.getTruckRoute).toHaveBeenCalledWith(mockOrigin, mockDestination, undefined, undefined);
    });

    it('should pass truck profile to provider', async () => {
      const profile = {
        height_feet: 13.5,
        weight_lbs: 80000,
        length_feet: 53,
        axle_count: 5,
        hazmat: false,
      };

      await service.getTruckRoute(mockOrigin, mockDestination, undefined, profile);

      expect(hereMaps.getTruckRoute).toHaveBeenCalledWith(mockOrigin, mockDestination, undefined, profile);
    });

    it('should record success in health service', async () => {
      await service.getTruckRoute(mockOrigin, mockDestination);

      expect(health.recordSuccess).toHaveBeenCalledWith('routing', expect.any(Number));
    });

    it('should record error in health service on failure', async () => {
      const error = new Error('Truck routing failed');
      hereMaps.getTruckRoute.mockRejectedValue(error);

      await expect(service.getTruckRoute(mockOrigin, mockDestination)).rejects.toThrow('Truck routing failed');

      expect(health.recordError).toHaveBeenCalledWith('routing', error);
    });
  });

  describe('provider resolution', () => {
    it('should default to HereMaps when unknown provider specified', async () => {
      const config = {
        routing: {
          provider: 'unknown_provider',
          apiKey: 'test-key',
          configured: true,
        },
      } as unknown as PlatformServicesConfig;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RoutingService,
          { provide: HereMapsProvider, useValue: hereMaps },
          { provide: PlatformServicesConfig, useValue: config },
          { provide: PlatformHealthService, useValue: health },
        ],
      }).compile();

      const svc = module.get(RoutingService);
      await svc.getRoute(mockOrigin, mockDestination);

      expect(hereMaps.getRoute).toHaveBeenCalled();
    });
  });
});

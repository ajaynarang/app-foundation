import { Test, TestingModule } from '@nestjs/testing';
import { WeatherService } from '../weather.service';
import { OpenWeatherProvider } from '../providers/openweather.provider';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { WeatherData } from '../weather-provider.interface';

describe('WeatherService', () => {
  let service: WeatherService;
  let openWeatherProvider: {
    getCurrentWeather: jest.Mock;
    getRouteForecast: jest.Mock;
  };
  let healthService: any;

  const mockWeatherData: WeatherData = {
    location: {
      latitude: 32.7767,
      longitude: -96.797,
      city: 'Dallas',
      state: 'TX',
    },
    current: {
      temperature_f: 75,
      feels_like_f: 73,
      conditions: 'clear',
      wind_speed_mph: 8,
      wind_direction: 'SW',
      visibility_miles: 10,
      humidity_percent: 55,
      precipitation_inches: 0,
    },
    road_conditions: 'GOOD',
    last_updated: '2026-02-24T12:00:00Z',
    data_source: 'mock_openweather',
  };

  beforeEach(async () => {
    openWeatherProvider = {
      getCurrentWeather: jest.fn().mockResolvedValue(mockWeatherData),
      getRouteForecast: jest.fn().mockResolvedValue([mockWeatherData]),
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

    const mockConfig = {
      weather: {
        provider: 'openweather',
        apiKey: 'test-key',
        configured: true,
      },
    } as unknown as PlatformServicesConfig;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: WeatherService,
          useFactory: () =>
            new WeatherService(
              mockConfig,
              healthService as unknown as PlatformHealthService,
              openWeatherProvider as unknown as OpenWeatherProvider,
            ),
        },
      ],
    }).compile();

    service = module.get(WeatherService);
  });

  describe('getCurrentWeather', () => {
    it('should delegate to provider and record success', async () => {
      const result = await service.getCurrentWeather(32.7767, -96.797);

      expect(openWeatherProvider.getCurrentWeather).toHaveBeenCalledWith(32.7767, -96.797);
      expect(result).toEqual(mockWeatherData);
      expect(healthService.recordSuccess).toHaveBeenCalledWith('weather', expect.any(Number));
    });

    it('should record error on provider failure', async () => {
      const error = new Error('API timeout');
      openWeatherProvider.getCurrentWeather.mockRejectedValue(error);

      await expect(service.getCurrentWeather(32.7767, -96.797)).rejects.toThrow('API timeout');
      expect(healthService.recordError).toHaveBeenCalledWith('weather', error);
    });

    it('should wrap non-Error throws in Error before recording', async () => {
      openWeatherProvider.getCurrentWeather.mockRejectedValue('string error');

      await expect(service.getCurrentWeather(32.7767, -96.797)).rejects.toBe('string error');
      expect(healthService.recordError).toHaveBeenCalledWith(
        'weather',
        expect.objectContaining({ message: 'string error' }),
      );
    });
  });

  describe('getRouteForecast', () => {
    const waypoints = [
      { latitude: 32.7767, longitude: -96.797 },
      { latitude: 29.7604, longitude: -95.3698 },
    ];

    it('should delegate to provider and record success', async () => {
      const result = await service.getRouteForecast(waypoints);

      expect(openWeatherProvider.getRouteForecast).toHaveBeenCalledWith(waypoints);
      expect(result).toEqual([mockWeatherData]);
      expect(healthService.recordSuccess).toHaveBeenCalledWith('weather', expect.any(Number));
    });

    it('should record error on provider failure', async () => {
      const error = new Error('Network error');
      openWeatherProvider.getRouteForecast.mockRejectedValue(error);

      await expect(service.getRouteForecast(waypoints)).rejects.toThrow('Network error');
      expect(healthService.recordError).toHaveBeenCalledWith('weather', error);
    });
  });

  describe('provider resolution', () => {
    it('should fall back to openweather for unknown provider', async () => {
      const mockConfig = {
        weather: {
          provider: 'unknown-provider',
          apiKey: 'key',
          configured: true,
        },
      } as unknown as PlatformServicesConfig;

      const fallbackService = new WeatherService(
        mockConfig,
        healthService as unknown as PlatformHealthService,
        openWeatherProvider as unknown as OpenWeatherProvider,
      );

      await fallbackService.getCurrentWeather(32.7767, -96.797);
      expect(openWeatherProvider.getCurrentWeather).toHaveBeenCalled();
    });
  });
});

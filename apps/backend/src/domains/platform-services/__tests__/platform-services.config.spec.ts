import { ConfigService } from '@nestjs/config';
import { PlatformServicesConfig } from '../platform-services.config';

describe('PlatformServicesConfig', () => {
  function createConfig(envOverrides: Record<string, string | undefined> = {}) {
    const configValues: Record<string, any> = {
      hereApiKey: envOverrides.hereApiKey ?? undefined,
      openWeatherApiKey: envOverrides.openWeatherApiKey ?? undefined,
      gasbuddyApiKey: envOverrides.gasbuddyApiKey ?? undefined,
      pcmilerApiKey: envOverrides.pcmilerApiKey ?? undefined,
      platformWeatherProvider: envOverrides.platformWeatherProvider ?? 'openweather',
      platformFuelProvider: envOverrides.platformFuelProvider ?? 'gasbuddy',
      platformRoutingProvider: envOverrides.platformRoutingProvider ?? 'here',
      platformGeocodingProvider: envOverrides.platformGeocodingProvider ?? 'here',
      platformMileageProvider: envOverrides.platformMileageProvider ?? 'trimble',
      platformTrafficProvider: envOverrides.platformTrafficProvider ?? 'here',
      platformTollProvider: envOverrides.platformTollProvider ?? 'here',
      anthropicApiKey: envOverrides.anthropicApiKey ?? undefined,
      ...envOverrides,
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        return configValues[key] ?? defaultValue ?? undefined;
      }),
    };

    return new PlatformServicesConfig(mockConfigService as unknown as ConfigService);
  }

  // ─── getAll ─────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return all service configurations', () => {
      const config = createConfig();
      const all = config.getAll();

      expect(all).toHaveProperty('weather');
      expect(all).toHaveProperty('fuelPrices');
      expect(all).toHaveProperty('routing');
      expect(all).toHaveProperty('geocoding');
      expect(all).toHaveProperty('mileage');
      expect(all).toHaveProperty('traffic');
      expect(all).toHaveProperty('tolls');
      expect(all).toHaveProperty('anthropic');
      expect(all).toHaveProperty('openai');
      expect(all).toHaveProperty('twilio');
      expect(all).toHaveProperty('resend');
      expect(all).toHaveProperty('s3');
      expect(all).toHaveProperty('firebaseAuth');
      expect(all).toHaveProperty('turnstile');
      expect(all).toHaveProperty('livekit');
      expect(all).toHaveProperty('deepgram');
      expect(all).toHaveProperty('cartesia');
      expect(all).toHaveProperty('langfuse');
      expect(all).toHaveProperty('aiGateway');
    });

    it('should mark services as configured when API keys exist', () => {
      const config = createConfig({
        hereApiKey: 'here-key-123',
        openWeatherApiKey: 'ow-key-456',
        gasbuddyApiKey: 'gb-key-789',
        pcmilerApiKey: 'pc-key-000',
      });
      const all = config.getAll();

      expect(all.weather.configured).toBe(true);
      expect(all.fuelPrices.configured).toBe(true);
      expect(all.routing.configured).toBe(true);
      expect(all.geocoding.configured).toBe(true);
      expect(all.mileage.configured).toBe(true);
      expect(all.traffic.configured).toBe(true);
      expect(all.tolls.configured).toBe(true);
    });

    it('should mark services as not configured when API keys are missing', () => {
      const config = createConfig();
      const all = config.getAll();

      expect(all.weather.configured).toBe(false);
      expect(all.fuelPrices.configured).toBe(false);
      expect(all.routing.configured).toBe(false);
      expect(all.geocoding.configured).toBe(false);
      expect(all.mileage.configured).toBe(false);
    });

    it('should set provider names correctly', () => {
      const config = createConfig();
      const all = config.getAll();

      expect(all.weather.provider).toBe('openweather');
      expect(all.fuelPrices.provider).toBe('gasbuddy');
      expect(all.routing.provider).toBe('here');
      expect(all.geocoding.provider).toBe('here');
      expect(all.mileage.provider).toBe('trimble');
      expect(all.traffic.provider).toBe('here');
      expect(all.tolls.provider).toBe('here');
    });

    it('should include dashboard URLs', () => {
      const config = createConfig();
      const all = config.getAll();

      expect(all.weather.dashboardUrl).toContain('openweathermap.org');
      expect(all.routing.dashboardUrl).toContain('here.com');
      expect(all.mileage.dashboardUrl).toContain('trimblemaps.com');
    });
  });

  // ─── Per-service accessors ──────────────────────────────────────────────

  describe('per-service accessors', () => {
    it('should return weather config', () => {
      const config = createConfig({ openWeatherApiKey: 'ow-key' });

      expect(config.weather.provider).toBe('openweather');
      expect(config.weather.apiKey).toBe('ow-key');
      expect(config.weather.configured).toBe(true);
    });

    it('should return fuel prices config', () => {
      const config = createConfig({ gasbuddyApiKey: 'gb-key' });

      expect(config.fuelPrices.provider).toBe('gasbuddy');
      expect(config.fuelPrices.configured).toBe(true);
    });

    it('should return routing config', () => {
      const config = createConfig({ hereApiKey: 'here-key' });

      expect(config.routing.provider).toBe('here');
      expect(config.routing.configured).toBe(true);
    });

    it('should return geocoding config', () => {
      const config = createConfig({ hereApiKey: 'here-key' });

      expect(config.geocoding.provider).toBe('here');
      expect(config.geocoding.configured).toBe(true);
    });

    it('should return mileage config', () => {
      const config = createConfig({ pcmilerApiKey: 'pc-key' });

      expect(config.mileage.provider).toBe('trimble');
      expect(config.mileage.configured).toBe(true);
    });

    it('should return traffic config', () => {
      const config = createConfig({ hereApiKey: 'here-key' });

      expect(config.traffic.provider).toBe('here');
      expect(config.traffic.configured).toBe(true);
    });

    it('should return tolls config', () => {
      const config = createConfig({ hereApiKey: 'here-key' });

      expect(config.tolls.provider).toBe('here');
      expect(config.tolls.configured).toBe(true);
    });
  });

  // ─── AI services ────────────────────────────────────────────────────────

  describe('AI services configuration', () => {
    it('should detect Anthropic API key', () => {
      const config = createConfig({ anthropicApiKey: 'sk-ant-xxx' });
      const all = config.getAll();

      expect(all.anthropic.configured).toBe(true);
      expect(all.anthropic.provider).toBe('Anthropic');
    });

    it('should mark Anthropic as not configured without key', () => {
      const config = createConfig();
      const all = config.getAll();

      expect(all.anthropic.configured).toBe(false);
    });
  });
});

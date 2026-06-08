import { OpenWeatherMapProvider } from '../openweathermap.provider';
import axios from 'axios';

jest.mock('axios');

/**
 * Mock both OpenWeather endpoints. `onecall` returns a hourly array (3.0);
 * `current` returns a 2.5 current-conditions doc. Pass `oneCallAvailable: false`
 * to simulate a key without the 3.0 add-on (forces the current-conditions path).
 */
function mockWeather(
  doc: { main: string; description: string; tempF: number; windMph: number },
  opts: { oneCallAvailable?: boolean; forecastTimeSec?: number } = {},
) {
  const { oneCallAvailable = true, forecastTimeSec } = opts;
  (axios.get as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/3.0/onecall')) {
      if (!oneCallAvailable) {
        // Mimic an AxiosError: a real Error carrying a `.response` with the status.
        return Promise.reject(
          Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }),
        );
      }
      return Promise.resolve({
        data: {
          hourly: [
            {
              dt: forecastTimeSec ?? Math.floor(Date.now() / 1000),
              weather: [{ main: doc.main, description: doc.description }],
              temp: doc.tempF,
              wind_speed: doc.windMph,
            },
          ],
        },
      });
    }
    // 2.5 current conditions
    return Promise.resolve({
      data: {
        weather: [{ main: doc.main, description: doc.description }],
        main: { temp: doc.tempF },
        wind: { speed: doc.windMph },
      },
    });
  });
}

describe('OpenWeatherMapProvider', () => {
  let provider: OpenWeatherMapProvider;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('test-api-key'),
    } as any;
    provider = new OpenWeatherMapProvider(configService);
    jest.clearAllMocks();
  });

  describe('getWeatherAlongRoute', () => {
    it('should return empty when no API key', async () => {
      const noKeyProvider = new OpenWeatherMapProvider({
        get: jest.fn().mockReturnValue(undefined),
      } as any);
      const result = await noKeyProvider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date());
      expect(result).toEqual([]);
    });

    it('should return weather alerts for route waypoints (3.0 hourly forecast)', async () => {
      mockWeather({ main: 'Snow', description: 'heavy snow', tempF: 15, windMph: 25 });
      const result = await provider.getWeatherAlongRoute(
        [
          { lat: 40, lon: -74 },
          { lat: 41, lon: -75 },
        ],
        new Date(),
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].condition).toBe('snow');
      expect(result[0].severity).toBe('severe'); // temp < 20
      // It hit the forecast endpoint, not just current conditions.
      expect((axios.get as jest.Mock).mock.calls.some((c) => String(c[0]).includes('/3.0/onecall'))).toBe(true);
    });

    it('should filter out low severity alerts', async () => {
      mockWeather({ main: 'Clear', description: 'clear sky', tempF: 70, windMph: 5 });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date());
      expect(result).toHaveLength(0);
    });

    it('should detect ice conditions', async () => {
      mockWeather({ main: 'Rain', description: 'freezing rain', tempF: 30, windMph: 10 });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date());
      expect(result[0].condition).toBe('ice');
      expect(result[0].severity).toBe('severe');
      expect(result[0].driveTimeMultiplier).toBe(1.5);
    });

    it('should detect thunderstorm', async () => {
      mockWeather({ main: 'Thunderstorm', description: 'thunderstorm', tempF: 75, windMph: 20 });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date());
      expect(result[0].condition).toBe('thunderstorm');
      expect(result[0].severity).toBe('moderate');
    });

    it('should escalate severity for high wind', async () => {
      mockWeather({ main: 'Clear', description: 'clear', tempF: 70, windMph: 45 });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date());
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].severity).toBe('severe');
    });

    it('should sample waypoints when more than maxCount', async () => {
      mockWeather({ main: 'Snow', description: 'snow', tempF: 25, windMph: 15 });
      const waypoints = Array.from({ length: 20 }, (_, i) => ({ lat: 40 + i * 0.1, lon: -74 + i * 0.1 }));
      await provider.getWeatherAlongRoute(waypoints, new Date());
      // 5 sampled points, one forecast call each.
      expect((axios.get as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('/3.0/onecall'))).toHaveLength(5);
    });

    it('should handle API errors gracefully', async () => {
      (axios.get as jest.Mock).mockRejectedValue(new Error('API timeout'));
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date());
      expect(result).toEqual([]);
    });

    it('should detect fog conditions', async () => {
      mockWeather({ main: 'Fog', description: 'dense fog', tempF: 50, windMph: 5 });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date());
      expect(result).toHaveLength(0); // fog is low severity, filtered
    });

    // ── Time awareness (§2.4 — the core fix) ──────────────────────────────
    it('picks the forecast hour nearest the segment time', async () => {
      const future = new Date(Date.now() + 18 * 3600000); // 18h out
      const futureSec = Math.floor(future.getTime() / 1000);
      // Hourly array: a clear hour now, a snowstorm at the target hour.
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          hourly: [
            {
              dt: Math.floor(Date.now() / 1000),
              weather: [{ main: 'Clear', description: 'clear' }],
              temp: 60,
              wind_speed: 3,
            },
            { dt: futureSec, weather: [{ main: 'Snow', description: 'blizzard' }], temp: 12, wind_speed: 30 },
          ],
        },
      });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], future);
      expect(result[0].condition).toBe('snow'); // the storm at the target hour, not "clear" now
    });

    it('does NOT present current conditions as a far-future forecast when 3.0 is unavailable', async () => {
      // No 3.0 entitlement; departure is 18h out → must skip rather than mislabel.
      mockWeather({ main: 'Snow', description: 'snow now', tempF: 15, windMph: 25 }, { oneCallAvailable: false });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date(Date.now() + 18 * 3600000));
      expect(result).toHaveLength(0);
    });

    it('falls back to current conditions for a near-term segment when 3.0 is unavailable', async () => {
      mockWeather({ main: 'Snow', description: 'snow now', tempF: 15, windMph: 25 }, { oneCallAvailable: false });
      const result = await provider.getWeatherAlongRoute([{ lat: 40, lon: -74 }], new Date()); // now → within lookahead
      expect(result[0].condition).toBe('snow');
    });
  });
});

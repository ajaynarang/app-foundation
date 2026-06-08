import { HereMileageProvider } from '../here-mileage.provider';
import { PlatformServicesConfig } from '../../../platform-services.config';

const DALLAS = { latitude: 32.7767, longitude: -96.797 };
const MEMPHIS = { latitude: 35.1495, longitude: -90.049 };

// 776,000 m ≈ 482.18 mi, 27,900 s = 7.75 h
const SAMPLE_HERE_RESPONSE = {
  routes: [
    {
      sections: [
        {
          summary: { length: 776000, duration: 27900 },
          polyline: 'BG_encoded_polyline',
        },
      ],
    },
  ],
};

function buildProvider(apiKey: string | null = 'test-key') {
  const key = apiKey === null ? undefined : apiKey;
  const config = {
    mileage: { provider: 'here', apiKey: key, configured: !!key },
  } as unknown as PlatformServicesConfig;
  return new HereMileageProvider(config);
}

describe('HereMileageProvider', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getTruckMiles', () => {
    it('maps a successful HERE Routing response to a MileageResult', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => SAMPLE_HERE_RESPONSE,
      } as unknown as Response);

      const provider = buildProvider();
      const result = await provider.getTruckMiles(DALLAS, MEMPHIS);

      expect(result.practical_miles).toBeCloseTo(482.18, 1);
      expect(result.rated_miles).toBe(result.practical_miles);
      expect(result.shortest_miles).toBe(result.practical_miles);
      expect(result.duration_hours).toBeCloseTo(7.75, 2);
      expect(result.provider).toBe('here');
      expect(result.origin).toBe('32.7767,-96.797');
      expect(result.destination).toBe('35.1495,-90.049');
    });

    it('builds a truck-mode HERE URL with origin, destination, and return params', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => SAMPLE_HERE_RESPONSE,
      } as unknown as Response);

      const provider = buildProvider();
      await provider.getTruckMiles(DALLAS, MEMPHIS);

      const [calledUrl] = fetchSpy.mock.calls[0] as [string];
      const url = new URL(calledUrl);
      expect(url.origin + url.pathname).toBe('https://router.hereapi.com/v8/routes');
      expect(url.searchParams.get('transportMode')).toBe('truck');
      expect(url.searchParams.get('origin')).toBe('32.7767,-96.797');
      expect(url.searchParams.get('destination')).toBe('35.1495,-90.049');
      expect(url.searchParams.get('apiKey')).toBe('test-key');
      expect(url.searchParams.get('return')).toContain('summary');
    });

    it('forwards a truck profile to HERE vehicle params', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => SAMPLE_HERE_RESPONSE,
      } as unknown as Response);

      const provider = buildProvider();
      await provider.getTruckMiles(DALLAS, MEMPHIS, {
        weight_lbs: 80000,
        height_feet: 13.5,
        axle_count: 5,
      });

      const [calledUrl] = fetchSpy.mock.calls[0] as [string];
      const url = new URL(calledUrl);
      // 80000 lb → ~36287 kg ; 13.5 ft → ~411 cm
      expect(Number(url.searchParams.get('vehicle[grossWeight]'))).toBeGreaterThan(36000);
      expect(Number(url.searchParams.get('vehicle[height]'))).toBeGreaterThan(400);
      expect(url.searchParams.get('vehicle[axleCount]')).toBe('5');
    });

    it('throws when the API key is not configured', async () => {
      const provider = buildProvider(null);
      await expect(provider.getTruckMiles(DALLAS, MEMPHIS)).rejects.toThrow(/not configured/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws on a non-OK HTTP response', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as unknown as Response);

      const provider = buildProvider();
      await expect(provider.getTruckMiles(DALLAS, MEMPHIS)).rejects.toThrow(/429/);
    });

    it('throws when HERE returns no usable route', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [] }),
      } as unknown as Response);

      const provider = buildProvider();
      await expect(provider.getTruckMiles(DALLAS, MEMPHIS)).rejects.toThrow(/no route/i);
    });
  });

  describe('getRatedMiles', () => {
    it('delegates to getTruckMiles (HERE has no separate rated-mile product)', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => SAMPLE_HERE_RESPONSE,
      } as unknown as Response);

      const provider = buildProvider();
      const result = await provider.getRatedMiles(DALLAS, MEMPHIS);
      expect(result.rated_miles).toBeCloseTo(482.18, 1);
    });
  });
});

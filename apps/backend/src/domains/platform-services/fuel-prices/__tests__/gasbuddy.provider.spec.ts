import { GasBuddyProvider } from '../providers/gasbuddy.provider';
import { PlatformServicesConfig } from '../../platform-services.config';

describe('GasBuddyProvider', () => {
  let provider: GasBuddyProvider;

  beforeEach(() => {
    const mockConfig = {
      fuelPrices: {
        provider: 'gasbuddy',
        apiKey: 'test-key',
        configured: true,
      },
    } as any;
    provider = new GasBuddyProvider(mockConfig as PlatformServicesConfig);
  });

  // ─── findStations ──────────────────────────────────────────────────────

  describe('findStations', () => {
    it('should return mock stations near a location', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('station_id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('brand');
      expect(result[0]).toHaveProperty('price_per_gallon');
      expect(result[0]).toHaveProperty('diesel_price');
      expect(result[0]).toHaveProperty('data_source');
      expect(result[0].data_source).toBe('mock_gasbuddy');
    });

    it('should filter stations by radius', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
        radius_miles: 3,
      });

      // Only stations within 3 miles should be returned
      for (const station of result) {
        expect(station.distance_miles).toBeLessThanOrEqual(3);
      }
    });

    it('should sort by distance by default', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
      });

      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].distance_miles).toBeLessThanOrEqual(result[i + 1].distance_miles);
      }
    });

    it('should sort by DIESEL price when sort_by is PRICE and fuel_type is DIESEL', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
        sort_by: 'PRICE',
        fuel_type: 'DIESEL',
      });

      for (let i = 0; i < result.length - 1; i++) {
        const priceA = result[i].diesel_price ?? result[i].price_per_gallon;
        const priceB = result[i + 1].diesel_price ?? result[i + 1].price_per_gallon;
        expect(priceA).toBeLessThanOrEqual(priceB);
      }
    });

    it('should sort by regular price when sort_by is PRICE without DIESEL fuel_type', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
        sort_by: 'PRICE',
      });

      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].price_per_gallon).toBeLessThanOrEqual(result[i + 1].price_per_gallon);
      }
    });

    it('should limit results by max_results', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
        max_results: 2,
      });

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should default max_results to 10', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
      });

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should include amenities data', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
      });

      expect(result[0].amenities).toBeDefined();
      expect(Array.isArray(result[0].amenities)).toBe(true);
      expect(result[0].amenities).toContain('truck_parking');
    });

    it('should include last_updated timestamp', async () => {
      const result = await provider.findStations({
        latitude: 32.7767,
        longitude: -96.797,
      });

      expect(result[0].last_updated).toBeDefined();
      // Should be a valid ISO date string
      expect(() => new Date(result[0].last_updated)).not.toThrow();
    });
  });

  // ─── Real API path ──────────────────────────────────────────────────────

  describe('real API path (useMockData = false)', () => {
    let realProvider: GasBuddyProvider;
    const mockFetch = jest.fn();

    beforeEach(() => {
      global.fetch = mockFetch as any;
      const mockConfig = {
        fuelPrices: {
          provider: 'gasbuddy',
          apiKey: 'real-key',
          configured: true,
        },
      } as any;
      realProvider = new GasBuddyProvider(mockConfig);
      (realProvider as any).useMockData = false;
      mockFetch.mockReset();
    });

    it('findStations should throw InternalServerErrorException for live data', async () => {
      // The real API code is a TODO that throws immediately
      await expect(
        realProvider.findStations({
          latitude: 32.78,
          longitude: -96.8,
        }),
      ).rejects.toThrow('Live fuel price data is not available yet');
    });

    it('getStationPrice should throw InternalServerErrorException for live data', async () => {
      await expect(realProvider.getStationPrice('gb_station_001')).rejects.toThrow(
        'Live fuel price data is not available yet',
      );
    });
  });

  // ─── getStationPrice ───────────────────────────────────────────────────

  describe('getStationPrice', () => {
    it('should return a specific station by ID', async () => {
      const result = await provider.getStationPrice('gb_station_001');

      expect(result).toBeDefined();
      expect(result.station_id).toBe('gb_station_001');
      expect(result.name).toBe('Pilot Travel Center');
    });

    it('should return first station when ID not found', async () => {
      const result = await provider.getStationPrice('nonexistent');

      expect(result).toBeDefined();
      // Should fall back to first mock station
      expect(result.station_id).toBe('gb_station_001');
    });

    it('should include price data', async () => {
      const result = await provider.getStationPrice('gb_station_002');

      expect(result.price_per_gallon).toBeGreaterThan(0);
      expect(result.diesel_price).toBeGreaterThan(0);
    });
  });
});

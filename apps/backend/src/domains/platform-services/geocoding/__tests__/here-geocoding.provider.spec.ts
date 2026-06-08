import { HereGeocodingProvider } from '../providers/here-geocoding.provider';
import { PlatformServicesConfig } from '../../platform-services.config';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('HereGeocodingProvider', () => {
  let provider: HereGeocodingProvider;
  let mockConfig: Partial<PlatformServicesConfig>;

  beforeEach(() => {
    mockConfig = {
      geocoding: { provider: 'here', apiKey: 'test-api-key', configured: true },
    };
    provider = new HereGeocodingProvider(mockConfig as PlatformServicesConfig);
    mockFetch.mockReset();
  });

  describe('geocode', () => {
    it('should call HERE Geocoding API and return mapped results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              position: { lat: 32.7767, lng: -96.797 },
              address: {
                label: '1234 Main St, Dallas, TX 75201, United States',
                city: 'Dallas',
                stateCode: 'TX',
                postalCode: '75201',
                countryCode: 'USA',
              },
              scoring: { queryScore: 0.95 },
            },
          ],
        }),
      });

      const results = await provider.geocode('1234 Main St, Dallas, TX');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('geocode.search.hereapi.com/v1/geocode'),
        expect.any(Object),
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        latitude: 32.7767,
        longitude: -96.797,
        formatted_address: '1234 Main St, Dallas, TX 75201, United States',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        country: 'USA',
        confidence: 0.95,
      });
    });

    it('should return empty array when API returns no items', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const results = await provider.geocode('nonexistent address xyz');
      expect(results).toEqual([]);
    });

    it('should return empty array and log error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const results = await provider.geocode('1234 Main St, Dallas, TX');
      expect(results).toEqual([]);
    });

    it('should return empty array when API key is not configured', async () => {
      mockConfig = {
        geocoding: { provider: 'here', apiKey: undefined, configured: false },
      };
      provider = new HereGeocodingProvider(mockConfig as PlatformServicesConfig);

      const results = await provider.geocode('1234 Main St, Dallas, TX');
      expect(results).toEqual([]);
    });
  });

  describe('reverseGeocode', () => {
    it('should call HERE Reverse Geocode API and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              position: { lat: 32.7767, lng: -96.797 },
              address: {
                label: '1234 Main St, Dallas, TX 75201, United States',
                city: 'Dallas',
                stateCode: 'TX',
                postalCode: '75201',
                countryCode: 'USA',
              },
              scoring: { queryScore: 0.9 },
            },
          ],
        }),
      });

      const result = await provider.reverseGeocode(32.7767, -96.797);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('revgeocode.search.hereapi.com/v1/revgeocode'),
        expect.any(Object),
      );
      expect(result.latitude).toBe(32.7767);
      expect(result.longitude).toBe(-96.797);
      expect(result.city).toBe('Dallas');
    });

    it('should return fallback result when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await provider.reverseGeocode(32.7767, -96.797);

      expect(result.latitude).toBe(32.7767);
      expect(result.longitude).toBe(-96.797);
      expect(result.confidence).toBe(0);
      expect(result.formatted_address).toContain('32.7767');
    });

    it('should return fallback when API key is not configured', async () => {
      mockConfig = {
        geocoding: { provider: 'here', apiKey: undefined, configured: false },
      };
      provider = new HereGeocodingProvider(mockConfig as PlatformServicesConfig);

      const result = await provider.reverseGeocode(32.7767, -96.797);

      expect(result.latitude).toBe(32.7767);
      expect(result.confidence).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return fallback when API returns empty items', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const result = await provider.reverseGeocode(32.7767, -96.797);

      expect(result.confidence).toBe(0);
      expect(result.formatted_address).toContain('32.7767');
    });

    it('should return fallback result on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.reverseGeocode(32.7767, -96.797);

      expect(result.latitude).toBe(32.7767);
      expect(result.confidence).toBe(0);
    });
  });

  describe('geocode network error', () => {
    it('should return empty array on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const results = await provider.geocode('1234 Main St');
      expect(results).toEqual([]);
    });
  });
});

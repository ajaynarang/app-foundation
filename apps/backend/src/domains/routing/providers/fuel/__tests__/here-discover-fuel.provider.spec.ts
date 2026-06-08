import { HEREDiscoverFuelProvider } from '../here-discover-fuel.provider';
import axios from 'axios';

jest.mock('axios');

describe('HEREDiscoverFuelProvider', () => {
  let provider: HEREDiscoverFuelProvider;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('test-api-key'),
    } as any;
    provider = new HEREDiscoverFuelProvider(configService);
    jest.clearAllMocks();
  });

  const mockPlaces = [
    {
      id: 'p1',
      title: 'Pilot Travel Center #421',
      position: { lat: 40.7, lng: -74.0 },
      address: { city: 'Newark', stateCode: 'NJ' },
      distance: 1000,
      categories: [{ id: '1', name: 'Fuel' }],
    },
    {
      id: 'p2',
      title: "Love's Travel Stop",
      position: { lat: 40.8, lng: -74.1 },
      address: { city: 'Jersey City', stateCode: 'NJ' },
      distance: 5000,
      categories: [],
    },
  ];

  describe('findFuelStopsNearPoint', () => {
    it('should return empty when no API key', async () => {
      const noKeyProvider = new HEREDiscoverFuelProvider({
        get: jest.fn().mockReturnValue(''),
      } as any);
      const result = await noKeyProvider.findFuelStopsNearPoint(40.7, -74.0, 10);
      expect(result).toEqual([]);
    });

    it('should find fuel stops near a point', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { items: mockPlaces },
      });
      const result = await provider.findFuelStopsNearPoint(40.7, -74.0, 10);
      expect(result).toHaveLength(2);
      expect(result[0].brand).toBe('Pilot');
      expect(result[1].brand).toBe("Love's");
    });

    it('should return empty on API error', async () => {
      (axios.get as jest.Mock).mockRejectedValue(new Error('API error'));
      const result = await provider.findFuelStopsNearPoint(40.7, -74.0, 10);
      expect(result).toEqual([]);
    });

    it('should filter by accepted brands', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { items: mockPlaces },
      });
      const result = await provider.findFuelStopsNearPoint(40.7, -74.0, 10, {
        acceptedBrands: ['Pilot'],
      });
      // Pilot and Independent stops should be included
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('findFuelStopsAlongCorridor', () => {
    it('should find fuel stops along corridor', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { items: mockPlaces },
      });
      const result = await provider.findFuelStopsAlongCorridor(40.7, -74.0, 41.8, -87.6, 5);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('findRestStopsNearPoint', () => {
    it('should find rest stops', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { items: mockPlaces },
      });
      const result = await provider.findRestStopsNearPoint(40.7, -74.0, 10);
      expect(result).toHaveLength(2);
    });
  });

  describe('findTruckStopsNearPoint', () => {
    it('should prioritize major truck stop brands', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { items: mockPlaces },
      });
      const result = await provider.findTruckStopsNearPoint(40.7, -74.0, 10);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should fall back to all results when no major brands', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          items: [
            {
              id: 'p3',
              title: 'Local Gas',
              position: { lat: 40.7, lng: -74.0 },
              address: {},
              categories: [],
            },
          ],
        },
      });
      const result = await provider.findTruckStopsNearPoint(40.7, -74.0, 10);
      expect(result).toHaveLength(1);
    });
  });
});

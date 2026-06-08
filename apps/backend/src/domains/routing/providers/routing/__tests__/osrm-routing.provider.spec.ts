import { OSRMRoutingProvider } from '../osrm-routing.provider';
import axios from 'axios';

jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({ get: jest.fn() }),
}));

describe('OSRMRoutingProvider', () => {
  let provider: OSRMRoutingProvider;
  let client: any;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:5000'),
    } as any;
    provider = new OSRMRoutingProvider(configService);
    client = (axios.create as jest.Mock).mock.results[0]?.value;
  });

  describe('getDistanceMatrix', () => {
    it('should return empty map for < 2 stops', async () => {
      const result = await provider.getDistanceMatrix([{ lat: 40, lon: -74 }]);
      expect(result.size).toBe(0);
    });

    it('should return matrix from OSRM', async () => {
      client.get.mockResolvedValue({
        data: {
          distances: [
            [0, 800000],
            [800000, 0],
          ],
          durations: [
            [0, 28800],
            [28800, 0],
          ],
        },
      });
      const stops = [
        { lat: 40.7, lon: -74.0, id: 'A' },
        { lat: 41.8, lon: -87.6, id: 'B' },
      ];
      const result = await provider.getDistanceMatrix(stops);
      expect(result.size).toBe(2);
      expect(result.get('A:B').distanceMiles).toBeGreaterThan(0);
    });

    it('should fall back to haversine on error', async () => {
      client.get.mockRejectedValue(new Error('OSRM error'));
      const stops = [
        { lat: 40.7, lon: -74.0 },
        { lat: 41.8, lon: -87.6 },
      ];
      const result = await provider.getDistanceMatrix(stops);
      expect(result.size).toBe(2);
    });
  });

  describe('getRoute', () => {
    it('should return route from OSRM', async () => {
      client.get.mockResolvedValue({
        data: {
          routes: [{ distance: 800000, duration: 28800, geometry: 'encoded-polyline' }],
          waypoints: [{ location: [-74.0, 40.7] }, { location: [-87.6, 41.8] }],
        },
      });
      const result = await provider.getRoute({ lat: 40.7, lon: -74.0 }, { lat: 41.8, lon: -87.6 });
      expect(result.distanceMiles).toBeGreaterThan(0);
      expect(result.geometry).toBe('encoded-polyline');
      expect(result.waypoints).toHaveLength(2);
    });

    it('should fall back to haversine on error', async () => {
      client.get.mockRejectedValue(new Error('OSRM error'));
      const result = await provider.getRoute({ lat: 40.7, lon: -74.0 }, { lat: 41.8, lon: -87.6 }, [
        { lat: 39.9, lon: -75.2 },
      ]);
      expect(result.distanceMiles).toBeGreaterThan(0);
      expect(result.waypoints).toHaveLength(3);
    });
  });
});

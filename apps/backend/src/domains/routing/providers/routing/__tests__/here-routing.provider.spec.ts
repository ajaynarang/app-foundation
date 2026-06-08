import { HereRoutingProvider } from '../here-routing.provider';
import axios from 'axios';

jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    get: jest.fn(),
    post: jest.fn(),
  }),
}));

describe('HereRoutingProvider', () => {
  let provider: HereRoutingProvider;
  let routeClient: any;
  let matrixClient: any;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('test-api-key'),
    } as any;
    provider = new HereRoutingProvider(configService);
    routeClient = (axios.create as jest.Mock).mock.results[0]?.value;
    matrixClient = (axios.create as jest.Mock).mock.results[1]?.value;
  });

  describe('getDistanceMatrix', () => {
    it('should return empty map for less than 2 stops', async () => {
      const result = await provider.getDistanceMatrix([{ lat: 40, lon: -74 }]);
      expect(result.size).toBe(0);
    });

    it('should return matrix from HERE API', async () => {
      matrixClient.post.mockResolvedValue({
        data: {
          matrix: {
            numDestinations: 2,
            distances: [0, 500000, 500000, 0],
            travelTimes: [0, 18000, 18000, 0],
            errorCodes: [0, 0, 0, 0],
          },
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

    it('should fall back to haversine on API error', async () => {
      matrixClient.post.mockRejectedValue(new Error('API error'));
      const stops = [
        { lat: 40.7, lon: -74.0, id: 'A' },
        { lat: 41.8, lon: -87.6, id: 'B' },
      ];
      const result = await provider.getDistanceMatrix(stops);
      expect(result.size).toBe(2);
    });

    it('should handle error codes in matrix entries', async () => {
      matrixClient.post.mockResolvedValue({
        data: {
          matrix: {
            numDestinations: 2,
            distances: [0, 0, 0, 0],
            travelTimes: [0, 0, 0, 0],
            errorCodes: [0, 3, 0, 0], // error for A→B
          },
        },
      });
      const stops = [
        { lat: 40, lon: -74, id: 'A' },
        { lat: 41, lon: -87, id: 'B' },
      ];
      const result = await provider.getDistanceMatrix(stops);
      expect(result.get('A:B')).toBeDefined();
    });
  });

  describe('getRoute', () => {
    it('should return route from HERE API', async () => {
      routeClient.get.mockResolvedValue({
        data: {
          routes: [
            {
              sections: [
                {
                  summary: { length: 800000, duration: 28800 },
                  polyline: 'encoded',
                  departure: { place: { location: { lat: 40.7, lng: -74.0 } } },
                  arrival: { place: { location: { lat: 41.8, lng: -87.6 } } },
                },
              ],
            },
          ],
        },
      });
      const result = await provider.getRoute({ lat: 40.7, lon: -74.0 }, { lat: 41.8, lon: -87.6 });
      expect(result.distanceMiles).toBeGreaterThan(0);
      expect(result.driveTimeHours).toBeGreaterThan(0);
      expect(result.geometry).toBe('encoded');
    });

    it('should fall back to haversine on error', async () => {
      routeClient.get.mockRejectedValue(new Error('API error'));
      const result = await provider.getRoute({ lat: 40.7, lon: -74.0 }, { lat: 41.8, lon: -87.6 });
      expect(result.distanceMiles).toBeGreaterThan(0);
      expect(result.geometry).toBe('');
    });

    it('should handle waypoints', async () => {
      routeClient.get.mockResolvedValue({
        data: {
          routes: [
            {
              sections: [
                {
                  summary: { length: 400000, duration: 14400 },
                  polyline: 'p1',
                  departure: { place: { location: { lat: 40.7, lng: -74.0 } } },
                  arrival: { place: { location: { lat: 39.9, lng: -75.2 } } },
                },
                {
                  summary: { length: 400000, duration: 14400 },
                  polyline: 'p2',
                  departure: { place: { location: { lat: 39.9, lng: -75.2 } } },
                  arrival: { place: { location: { lat: 41.8, lng: -87.6 } } },
                },
              ],
            },
          ],
        },
      });
      const result = await provider.getRoute({ lat: 40.7, lon: -74.0 }, { lat: 41.8, lon: -87.6 }, [
        { lat: 39.9, lon: -75.2 },
      ]);
      expect(result.geometry).toBe('p1;p2');
    });
  });
});

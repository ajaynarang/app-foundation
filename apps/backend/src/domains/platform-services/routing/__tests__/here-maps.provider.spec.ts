import { HereMapsProvider } from '../providers/here-maps.provider';
import { PlatformServicesConfig } from '../../platform-services.config';
import { Waypoint } from '../routing-provider.interface';

describe('HereMapsProvider', () => {
  let provider: HereMapsProvider;

  beforeEach(() => {
    const mockConfig = {
      routing: { provider: 'here', apiKey: 'test-api-key', configured: true },
    } as any;
    provider = new HereMapsProvider(mockConfig as PlatformServicesConfig);
  });

  const origin: Waypoint = { latitude: 32.7767, longitude: -96.797 };
  const destination: Waypoint = { latitude: 33.749, longitude: -84.388 };

  // ─── getRoute ───────────────────────────────────────────────────────────

  describe('getRoute', () => {
    it('should calculate a route between two points', async () => {
      const result = await provider.getRoute(origin, destination);

      expect(result.distance_miles).toBeGreaterThan(0);
      expect(result.duration_minutes).toBeGreaterThan(0);
      expect(result.polyline).toContain('mock_polyline:');
      expect(result.waypoints).toHaveLength(2);
      expect(result.segments).toHaveLength(1);
    });

    it('should return distance consistent with Haversine calculation', async () => {
      const result = await provider.getRoute(origin, destination);

      // Dallas to Atlanta is roughly 720-730 miles by Haversine
      expect(result.distance_miles).toBeGreaterThan(600);
      expect(result.distance_miles).toBeLessThan(900);
    });

    it('should calculate duration based on 55 mph average', async () => {
      const result = await provider.getRoute(origin, destination);

      // duration_minutes = (distance / 55) * 60
      const expectedDuration = (result.distance_miles / 55) * 60;
      expect(result.duration_minutes).toBeCloseTo(expectedDuration, 0);
    });

    it('should include waypoints in the route', async () => {
      const waypoints: Waypoint[] = [
        { latitude: 33.52, longitude: -86.81 }, // Birmingham
      ];

      const result = await provider.getRoute(origin, destination, waypoints);

      expect(result.waypoints).toHaveLength(3);
      expect(result.segments).toHaveLength(2);
      expect(result.distance_miles).toBeGreaterThan(0);
    });

    it('should generate segments between consecutive points', async () => {
      const waypoints: Waypoint[] = [{ latitude: 33.52, longitude: -86.81 }];

      const result = await provider.getRoute(origin, destination, waypoints);

      // Verify first segment goes from origin to waypoint
      expect(result.segments[0].start).toEqual(origin);
      expect(result.segments[0].end).toEqual(waypoints[0]);
      // Verify second segment goes from waypoint to destination
      expect(result.segments[1].start).toEqual(waypoints[0]);
      expect(result.segments[1].end).toEqual(destination);
    });

    it('should return total distance as sum of segments', async () => {
      const waypoints: Waypoint[] = [{ latitude: 33.52, longitude: -86.81 }];

      const result = await provider.getRoute(origin, destination, waypoints);

      const segmentTotal = result.segments.reduce((sum, s) => sum + s.distance_miles, 0);
      expect(result.distance_miles).toBeCloseTo(segmentTotal, 1);
    });

    it('should return total duration as sum of segments', async () => {
      const waypoints: Waypoint[] = [{ latitude: 33.52, longitude: -86.81 }];

      const result = await provider.getRoute(origin, destination, waypoints);

      const segmentTotal = result.segments.reduce((sum, s) => sum + s.duration_minutes, 0);
      expect(result.duration_minutes).toBeCloseTo(segmentTotal, 1);
    });

    it('should handle empty waypoints array', async () => {
      const result = await provider.getRoute(origin, destination, []);

      expect(result.waypoints).toHaveLength(2);
      expect(result.segments).toHaveLength(1);
    });

    it('should handle undefined waypoints', async () => {
      const result = await provider.getRoute(origin, destination);

      expect(result.waypoints).toHaveLength(2);
      expect(result.segments).toHaveLength(1);
    });

    it('should generate a mock polyline from coordinates', async () => {
      const result = await provider.getRoute(origin, destination);

      expect(result.polyline).toContain(origin.latitude.toFixed(5));
      expect(result.polyline).toContain(destination.latitude.toFixed(5));
    });

    it('should round distance and duration to 2 decimal places', async () => {
      const result = await provider.getRoute(origin, destination);

      const distanceDecimals = result.distance_miles.toString().split('.')[1];
      expect(!distanceDecimals || distanceDecimals.length <= 2).toBe(true);
    });
  });

  // ─── getTruckRoute ──────────────────────────────────────────────────────

  describe('getTruckRoute', () => {
    it('should return longer route than car route (10% overhead)', async () => {
      const carRoute = await provider.getRoute(origin, destination);
      const truckRoute = await provider.getTruckRoute(origin, destination);

      expect(truckRoute.distance_miles).toBeGreaterThan(carRoute.distance_miles);
      expect(truckRoute.duration_minutes).toBeGreaterThan(carRoute.duration_minutes);

      // 10% overhead for distance
      const expectedDistance = carRoute.distance_miles * 1.1;
      expect(truckRoute.distance_miles).toBeCloseTo(expectedDistance, 0);
    });

    it('should add 15% overhead for hazmat trucks', async () => {
      const carRoute = await provider.getRoute(origin, destination);
      const hazmatRoute = await provider.getTruckRoute(origin, destination, undefined, { hazmat: true });

      // 15% overhead for hazmat distance
      const expectedDistance = carRoute.distance_miles * 1.15;
      expect(hazmatRoute.distance_miles).toBeCloseTo(expectedDistance, 0);

      // 20% overhead for hazmat duration
      const expectedDuration = carRoute.duration_minutes * 1.2;
      expect(hazmatRoute.duration_minutes).toBeCloseTo(expectedDuration, 0);
    });

    it('should add 15% duration overhead for regular trucks', async () => {
      const carRoute = await provider.getRoute(origin, destination);
      const truckRoute = await provider.getTruckRoute(origin, destination);

      const expectedDuration = carRoute.duration_minutes * 1.15;
      expect(truckRoute.duration_minutes).toBeCloseTo(expectedDuration, 0);
    });

    it('should pass through waypoints to base route calculation', async () => {
      const waypoints: Waypoint[] = [{ latitude: 33.52, longitude: -86.81 }];

      const truckRoute = await provider.getTruckRoute(origin, destination, waypoints);

      expect(truckRoute.segments).toHaveLength(2);
    });

    it('should apply multiplier to each segment', async () => {
      const truckRoute = await provider.getTruckRoute(origin, destination);
      const carRoute = await provider.getRoute(origin, destination);

      // Each segment should be scaled by 1.1x for distance
      for (let i = 0; i < truckRoute.segments.length; i++) {
        const expectedDist = carRoute.segments[i].distance_miles * 1.1;
        expect(truckRoute.segments[i].distance_miles).toBeCloseTo(expectedDist, 0);
      }
    });

    it('should default to non-hazmat when profile is undefined', async () => {
      const carRoute = await provider.getRoute(origin, destination);
      const truckRoute = await provider.getTruckRoute(origin, destination);

      // 10% (non-hazmat) overhead
      const expectedDistance = carRoute.distance_miles * 1.1;
      expect(truckRoute.distance_miles).toBeCloseTo(expectedDistance, 0);
    });
  });

  // ─── Haversine accuracy ─────────────────────────────────────────────────

  describe('haversine distance accuracy', () => {
    it('should return 0 distance for same point', async () => {
      const result = await provider.getRoute(origin, origin);
      expect(result.distance_miles).toBe(0);
      expect(result.duration_minutes).toBe(0);
    });

    it('should handle antipodal points', async () => {
      const pointA: Waypoint = { latitude: 0, longitude: 0 };
      const pointB: Waypoint = { latitude: 0, longitude: 180 };

      const result = await provider.getRoute(pointA, pointB);

      // Half the earth's circumference in miles ~ 12,450 miles
      expect(result.distance_miles).toBeGreaterThan(10000);
      expect(result.distance_miles).toBeLessThan(15000);
    });
  });
});

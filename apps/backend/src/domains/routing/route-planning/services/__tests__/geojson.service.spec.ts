import { GeoJSONService } from '../geojson.service';

// Mock the @here/flexpolyline decode function
jest.mock('@here/flexpolyline', () => ({
  decode: jest.fn().mockReturnValue({
    polyline: [
      [32.78, -96.8],
      [33.0, -90.0],
      [33.75, -84.39],
    ],
  }),
}));

describe('GeoJSONService', () => {
  let service: GeoJSONService;

  beforeEach(() => {
    service = new GeoJSONService();
  });

  const makeDriveSegment = (overrides?: any) => ({
    segmentId: 'seg-drive-1',
    segmentType: 'drive',
    sequenceOrder: 1,
    fromLat: 32.78,
    fromLon: -96.8,
    toLat: 33.75,
    toLon: -84.39,
    fromLocation: 'Dallas, TX',
    toLocation: 'Atlanta, GA',
    distanceMiles: 780,
    driveTimeHours: 12,
    routeGeometry: 'BFoz5xJ67i1B1B7PB',
    hosStateAfter: {
      hoursDriven: 5,
      onDutyTime: 6,
      hoursSinceBreak: 3,
      drivingHoursSinceBreak: 3,
      cycleHoursUsed: 20,
    },
    ...overrides,
  });

  const makeRestSegment = (overrides?: any) => ({
    segmentId: 'seg-rest-1',
    segmentType: 'rest',
    sequenceOrder: 2,
    toLat: 33.5,
    toLon: -86.0,
    toLocation: 'Truck Stop, Birmingham',
    restDurationHours: 10,
    restType: 'full',
    restReason: 'HOS 11-hour limit',
    estimatedArrival: new Date('2026-03-10T10:00:00Z'),
    estimatedDeparture: new Date('2026-03-10T20:00:00Z'),
    ...overrides,
  });

  const makeFuelSegment = (overrides?: any) => ({
    segmentId: 'seg-fuel-1',
    segmentType: 'fuel',
    sequenceOrder: 3,
    toLat: 33.6,
    toLon: -85.5,
    toLocation: 'Pilot Travel Center',
    fuelStationName: 'Pilot Travel Center',
    fuelPricePerGallon: 3.45,
    fuelCostEstimate: 172.5,
    fuelGallons: 50,
    detourMiles: 2.1,
    fuelStateAfter: { rangeRemainingMiles: 500 },
    ...overrides,
  });

  const makeDockSegment = (overrides?: any) => ({
    segmentId: 'seg-dock-1',
    segmentType: 'dock',
    sequenceOrder: 4,
    toLat: 33.75,
    toLon: -84.39,
    toLocation: 'ABC Warehouse, Atlanta',
    dockDurationHours: 2,
    customerName: 'ABC Logistics',
    actionType: 'delivery',
    isDocktimeConverted: false,
    ...overrides,
  });

  // ─── Basic feature collection ────────────────────────────────────────────

  describe('planToGeoJSON', () => {
    it('should return a valid FeatureCollection', () => {
      const result = service.planToGeoJSON({
        segments: [makeDriveSegment()],
      });

      expect(result.type).toBe('FeatureCollection');
      expect(Array.isArray(result.features)).toBe(true);
    });

    it('should return empty features for empty segments', () => {
      const result = service.planToGeoJSON({ segments: [] });

      expect(result.features).toEqual([]);
    });
  });

  // ─── Drive segment LineString ────────────────────────────────────────────

  describe('drive segment geometry', () => {
    it('should decode polyline into LineString with [lng, lat] coordinates', () => {
      const result = service.planToGeoJSON({
        segments: [makeDriveSegment()],
      });

      const lineFeature = result.features.find((f) => f.geometry.type === 'LineString');
      expect(lineFeature).toBeDefined();
      // GeoJSON uses [lng, lat], HERE returns [lat, lng]
      const coords = lineFeature.geometry.coordinates as number[][];
      expect(coords[0]).toEqual([-96.8, 32.78]);
    });

    it('should include HOS state in properties', () => {
      const result = service.planToGeoJSON({
        segments: [makeDriveSegment()],
      });

      const lineFeature = result.features.find((f) => f.geometry.type === 'LineString');
      expect(lineFeature.properties.hosHoursDriven).toBe(5);
      expect(lineFeature.properties.hosOnDutyTime).toBe(6);
    });

    it('should add origin point for first drive segment', () => {
      const result = service.planToGeoJSON({
        segments: [makeDriveSegment({ sequenceOrder: 1 })],
      });

      const originFeature = result.features.find((f) => f.properties.segmentType === 'origin');
      expect(originFeature).toBeDefined();
      expect(originFeature.geometry.type).toBe('Point');
    });
  });

  // ─── Stop point features ─────────────────────────────────────────────────

  describe('stop segment point features', () => {
    it('should create rest stop point', () => {
      const result = service.planToGeoJSON({
        segments: [makeRestSegment()],
      });

      const restPoint = result.features.find((f) => f.geometry.type === 'Point' && f.properties.segmentType === 'rest');
      expect(restPoint).toBeDefined();
      expect(restPoint.properties.icon).toBe('lodging');
      expect(restPoint.properties.restDurationHours).toBe(10);
    });

    it('should create fuel stop point with pricing details', () => {
      const result = service.planToGeoJSON({
        segments: [makeFuelSegment()],
      });

      const fuelPoint = result.features.find((f) => f.geometry.type === 'Point' && f.properties.segmentType === 'fuel');
      expect(fuelPoint).toBeDefined();
      expect(fuelPoint.properties.fuelStationName).toBe('Pilot Travel Center');
      expect(fuelPoint.properties.fuelPricePerGallon).toBe(3.45);
      expect(fuelPoint.properties.fuelRangeAfterMiles).toBe(500);
    });

    it('should create dock point with customer details', () => {
      const result = service.planToGeoJSON({
        segments: [makeDockSegment()],
      });

      const dockPoint = result.features.find((f) => f.geometry.type === 'Point' && f.properties.segmentType === 'dock');
      expect(dockPoint).toBeDefined();
      expect(dockPoint.properties.customerName).toBe('ABC Logistics');
      expect(dockPoint.properties.actionType).toBe('delivery');
    });
  });

  // ─── Destination feature ─────────────────────────────────────────────────

  describe('destination point', () => {
    it('should add destination point when last segment has no existing point', () => {
      // Use a drive segment as last — no stop point is created for drive segments
      const result = service.planToGeoJSON({
        segments: [
          makeDriveSegment({ sequenceOrder: 1, segmentId: 'seg-d1' }),
          makeDriveSegment({
            sequenceOrder: 2,
            segmentId: 'seg-d2',
            toLat: 34.0,
            toLon: -85.0,
            toLocation: 'Final Stop',
          }),
        ],
      });

      const destFeature = result.features.find((f) => f.properties.segmentType === 'destination');
      expect(destFeature).toBeDefined();
      expect(destFeature.geometry.type).toBe('Point');
      expect(destFeature.properties.name).toBe('Final Stop');
    });

    it('should not duplicate destination when last segment already has a point', () => {
      const result = service.planToGeoJSON({
        segments: [makeDockSegment({ sequenceOrder: 1 })],
      });

      // The dock already created a point with segmentId 'seg-dock-1'
      // Destination check should see the existing point and skip
      const destFeatures = result.features.filter((f) => f.properties.segmentType === 'destination');
      expect(destFeatures).toHaveLength(0);
    });
  });

  // ─── Segment colors ─────────────────────────────────────────────────────

  describe('segment colors', () => {
    it('should assign correct colors per segment type', () => {
      const result = service.planToGeoJSON({
        segments: [makeRestSegment(), makeFuelSegment(), makeDockSegment()],
      });

      const restPoint = result.features.find((f) => f.properties.segmentType === 'rest');
      const fuelPoint = result.features.find((f) => f.properties.segmentType === 'fuel');
      const dockPoint = result.features.find((f) => f.properties.segmentType === 'dock');

      expect(restPoint.properties.color).toBe('#8b5cf6');
      expect(fuelPoint.properties.color).toBe('#f59e0b');
      expect(dockPoint.properties.color).toBe('#4ade80');
    });
  });

  // ─── Bad geometry ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should skip segment with invalid polyline gracefully', async () => {
      const { decode } = await import('@here/flexpolyline');
      (decode as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid polyline');
      });

      const result = service.planToGeoJSON({
        segments: [makeDriveSegment()],
      });

      // Should still have origin point but no LineString
      const lineFeatures = result.features.filter((f) => f.geometry.type === 'LineString');
      expect(lineFeatures).toHaveLength(0);
    });

    it('should skip stop points with missing coordinates', () => {
      const result = service.planToGeoJSON({
        segments: [makeRestSegment({ toLat: null, toLon: null })],
      });

      const points = result.features.filter((f) => f.geometry.type === 'Point');
      expect(points).toHaveLength(0);
    });
  });
});

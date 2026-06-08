import { PlanMissedStopCheck } from '../plan-missed-stop.check';
import { LoadCheckContext } from '../../../monitoring.types';

describe('PlanMissedStopCheck', () => {
  let check: PlanMissedStopCheck;

  beforeEach(() => {
    check = new PlanMissedStopCheck();
  });

  it('should have correct metadata', () => {
    expect(check.id).toBe('plan_missed_stop');
    expect(check.severity).toBe('high');
    expect(check.autoResolve).toBe(false);
    expect(check.needs).toContain('route_plan_data');
  });

  it('should return null when no active plan', () => {
    const ctx = makeContext({ activePlan: undefined });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should return null when no driver position', () => {
    const ctx = makeContext({ driverPosition: null });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should return null when no current or next segment', () => {
    const ctx = makeContext({
      activePlan: {
        planId: 'p-1',
        segments: [],
        departureTime: new Date(),
        estimatedArrival: new Date(),
      },
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should return null when no planned fuel/rest segments behind driver', () => {
    const ctx = makeContext({
      activePlan: {
        planId: 'p-1',
        segments: [
          makeSeg({
            sequenceOrder: 1,
            segmentType: 'drive',
            status: 'IN_PROGRESS',
          }),
        ],
        currentSegment: makeSeg({
          sequenceOrder: 1,
          segmentType: 'drive',
          status: 'IN_PROGRESS',
        }),
        departureTime: new Date(),
        estimatedArrival: new Date(),
      },
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should trigger when driver is past a planned fuel stop', () => {
    // Driver is at (41.0, -74.0), fuel stop was at (40.0, -74.0) - ~69 miles apart
    const ctx = makeContext({
      driverPosition: { lat: 41.0, lon: -74.0, speed: 60 },
      activePlan: {
        planId: 'p-1',
        segments: [
          makeSeg({
            sequenceOrder: 1,
            segmentType: 'fuel',
            status: 'PLANNED',
            toLat: 40.0,
            toLon: -74.0,
            toLocation: 'Pilot #123',
          }),
          makeSeg({
            sequenceOrder: 2,
            segmentType: 'drive',
            status: 'IN_PROGRESS',
          }),
        ],
        currentSegment: makeSeg({
          sequenceOrder: 2,
          segmentType: 'drive',
          status: 'IN_PROGRESS',
        }),
        departureTime: new Date(),
        estimatedArrival: new Date(),
      },
    });
    const result = check.run(ctx, {});
    expect(result).not.toBeNull();
    expect(result.type).toBe('PLAN_MISSED_STOP');
    expect(result.requiresReplan).toBe(true);
    expect(result.params.segmentType).toBe('fuel');
    expect(result.etaImpactMinutes).toBe(30); // fuel stop default
  });

  it('should not trigger when driver is near planned stop', () => {
    // Driver is at same location as fuel stop
    const ctx = makeContext({
      driverPosition: { lat: 40.0, lon: -74.0, speed: 60 },
      activePlan: {
        planId: 'p-1',
        segments: [
          makeSeg({
            sequenceOrder: 1,
            segmentType: 'fuel',
            status: 'PLANNED',
            toLat: 40.0,
            toLon: -74.0,
          }),
          makeSeg({
            sequenceOrder: 2,
            segmentType: 'drive',
            status: 'IN_PROGRESS',
          }),
        ],
        currentSegment: makeSeg({ sequenceOrder: 2 }),
        departureTime: new Date(),
        estimatedArrival: new Date(),
      },
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should not trigger when driver is stopped (speed <= 5)', () => {
    const ctx = makeContext({
      driverPosition: { lat: 41.0, lon: -74.0, speed: 3 },
      activePlan: {
        planId: 'p-1',
        segments: [
          makeSeg({
            sequenceOrder: 1,
            segmentType: 'fuel',
            status: 'PLANNED',
            toLat: 40.0,
            toLon: -74.0,
          }),
          makeSeg({
            sequenceOrder: 2,
            segmentType: 'drive',
            status: 'IN_PROGRESS',
          }),
        ],
        currentSegment: makeSeg({ sequenceOrder: 2 }),
        departureTime: new Date(),
        estimatedArrival: new Date(),
      },
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should estimate rest stop impact from restDurationHours', () => {
    const ctx = makeContext({
      driverPosition: { lat: 41.0, lon: -74.0, speed: 60 },
      activePlan: {
        planId: 'p-1',
        segments: [
          makeSeg({
            sequenceOrder: 1,
            segmentType: 'rest',
            status: 'PLANNED',
            toLat: 40.0,
            toLon: -74.0,
            restDurationHours: 10,
          }),
          makeSeg({
            sequenceOrder: 2,
            segmentType: 'drive',
            status: 'IN_PROGRESS',
          }),
        ],
        currentSegment: makeSeg({ sequenceOrder: 2 }),
        departureTime: new Date(),
        estimatedArrival: new Date(),
      },
    });
    const result = check.run(ctx, {});
    expect(result).not.toBeNull();
    expect(result.etaImpactMinutes).toBe(600); // 10 hours * 60
  });

  it('should use nextSegment when no currentSegment', () => {
    const ctx = makeContext({
      driverPosition: { lat: 41.0, lon: -74.0, speed: 60 },
      activePlan: {
        planId: 'p-1',
        segments: [
          makeSeg({
            sequenceOrder: 1,
            segmentType: 'fuel',
            status: 'PLANNED',
            toLat: 40.0,
            toLon: -74.0,
          }),
          makeSeg({
            sequenceOrder: 2,
            segmentType: 'drive',
            status: 'PLANNED',
          }),
        ],
        nextSegment: makeSeg({
          sequenceOrder: 2,
          segmentType: 'drive',
          status: 'PLANNED',
        }),
        departureTime: new Date(),
        estimatedArrival: new Date(),
      },
    });
    const result = check.run(ctx, {});
    expect(result).not.toBeNull();
  });
});

function makeContext(overrides: Partial<LoadCheckContext> = {}): LoadCheckContext {
  return {
    load: {
      id: 1,
      loadNumber: 'LD-1',
      status: 'IN_TRANSIT',
      driverId: 1,
      vehicleId: 1,
      assignedAt: new Date(),
      inTransitAt: new Date(),
      loadStops: [],
    },
    driver: { id: 1, driverId: 'DRV-1', name: 'John', tenantId: 1 },
    nextPendingStop: null,
    driverPosition: { lat: 40.7, lon: -74.0, speed: 60 },
    estimatedDriveMinutes: 30,
    activePlan: {
      planId: 'p-1',
      segments: [],
      departureTime: new Date(),
      estimatedArrival: new Date(),
    },
    ...overrides,
  };
}

function makeSeg(overrides: any = {}): any {
  return {
    segmentId: 'seg-1',
    sequenceOrder: 1,
    segmentType: 'drive',
    status: 'IN_PROGRESS',
    fromLocation: null,
    toLocation: null,
    estimatedArrival: null,
    estimatedDeparture: null,
    distanceMiles: null,
    driveTimeHours: null,
    restDurationHours: null,
    progress: null,
    toLat: null,
    toLon: null,
    ...overrides,
  };
}

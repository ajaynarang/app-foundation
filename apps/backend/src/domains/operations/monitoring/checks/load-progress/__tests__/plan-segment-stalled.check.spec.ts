import { PlanSegmentStalledCheck } from '../plan-segment-stalled.check';

describe('PlanSegmentStalledCheck', () => {
  let check: PlanSegmentStalledCheck;

  beforeEach(() => {
    check = new PlanSegmentStalledCheck();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const baseContext = {
    load: { loadNumber: 'LD-001', loadStops: [] },
    driver: { driverId: 'DRV-001', name: 'John Doe' },
    activePlan: null,
    nextPendingStop: null,
    estimatedDriveMinutes: null,
    gpsData: null,
    hosData: null,
  };

  it('should return null when no active plan', () => {
    const result = check.run(baseContext as any, {});
    expect(result).toBeNull();
  });

  it('should return null when no current segment', () => {
    const ctx = {
      ...baseContext,
      activePlan: { currentSegment: null },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should return null for dock segments', () => {
    const ctx = {
      ...baseContext,
      activePlan: {
        currentSegment: {
          segmentType: 'dock',
          estimatedDeparture: new Date().toISOString(),
        },
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should return null when no estimatedDeparture', () => {
    const ctx = {
      ...baseContext,
      activePlan: {
        currentSegment: {
          segmentType: 'drive',
          estimatedDeparture: null,
          driveTimeHours: 2,
        },
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should trigger when drive segment takes 2x expected duration', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-001',
          segmentType: 'drive',
          estimatedDeparture: twoHoursAgo.toISOString(),
          driveTimeHours: 0.5, // 30 min expected, but 2h elapsed
          fromLocation: 'Dallas, TX',
          toLocation: 'Houston, TX',
        },
      },
    };

    const result = check.run(ctx as any, {});

    expect(result).not.toBeNull();
    expect(result.type).toBe('PLAN_SEGMENT_STALLED');
    expect(result.severity).toBe('high');
    expect(result.requiresReplan).toBe(true);
    expect(result.params.segmentType).toBe('drive');
  });

  it('should not trigger when within multiplier', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-001',
          segmentType: 'drive',
          estimatedDeparture: thirtyMinAgo.toISOString(),
          driveTimeHours: 1, // 60 min expected, 30 min elapsed
        },
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should handle rest segments', () => {
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-002',
          segmentType: 'rest',
          estimatedDeparture: twentyHoursAgo.toISOString(),
          restDurationHours: 8,
          fromLocation: null,
          toLocation: null,
        },
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).not.toBeNull();
    expect(result.params.segmentType).toBe('rest');
  });

  it('should handle fuel segments with 30min default duration', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-003',
          segmentType: 'fuel',
          estimatedDeparture: twoHoursAgo.toISOString(),
          fromLocation: 'Truck Stop',
          toLocation: 'Truck Stop',
        },
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).not.toBeNull();
    expect(result.params.segmentType).toBe('fuel');
  });

  it('should return null when segment has no expected duration', () => {
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-004',
          segmentType: 'drive',
          estimatedDeparture: new Date().toISOString(),
          driveTimeHours: null,
        },
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should respect custom multiplier threshold', () => {
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-001',
          segmentType: 'drive',
          estimatedDeparture: ninetyMinAgo.toISOString(),
          driveTimeHours: 1, // 60 min expected
          fromLocation: 'A',
          toLocation: 'B',
        },
      },
    };

    // Default multiplier=2 -> 90/60=1.5x, not enough
    expect(check.run(ctx as any, {})).toBeNull();

    // Custom multiplier=1.2 -> 90/60=1.5x > 1.2, triggers
    const result = check.run(ctx as any, { segmentStalledMultiplier: 1.2 });
    expect(result).not.toBeNull();
  });
});

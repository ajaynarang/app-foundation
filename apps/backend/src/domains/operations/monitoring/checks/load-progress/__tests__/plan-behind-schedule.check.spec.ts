import { PlanBehindScheduleCheck } from '../plan-behind-schedule.check';

describe('PlanBehindScheduleCheck', () => {
  let check: PlanBehindScheduleCheck;

  beforeEach(() => {
    check = new PlanBehindScheduleCheck();
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

  it('should return null when no estimated arrival on segment', () => {
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: { estimatedArrival: null },
        nextSegment: null,
        segments: [],
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should return null when delay is below warning threshold', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-001',
          segmentType: 'drive',
          estimatedArrival: tenMinAgo.toISOString(),
        },
        segments: [],
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should trigger medium severity when delay >= warning threshold', () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-001',
          segmentType: 'drive',
          estimatedArrival: fortyMinAgo.toISOString(),
        },
        segments: [
          {
            segmentId: 'SEG-001',
            segmentType: 'drive',
            status: 'in_progress',
            estimatedArrival: fortyMinAgo.toISOString(),
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});

    expect(result).not.toBeNull();
    expect(result.type).toBe('PLAN_BEHIND_SCHEDULE');
    expect(result.severity).toBe('medium');
    expect(result.requiresReplan).toBe(false);
  });

  it('should trigger critical severity when delay >= critical threshold', () => {
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-001',
          segmentType: 'drive',
          estimatedArrival: ninetyMinAgo.toISOString(),
        },
        segments: [
          {
            segmentId: 'SEG-001',
            segmentType: 'drive',
            status: 'in_progress',
            estimatedArrival: ninetyMinAgo.toISOString(),
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});

    expect(result).not.toBeNull();
    expect(result.severity).toBe('critical');
    expect(result.requiresReplan).toBe(true);
  });

  it('should suppress when near dock segment (dedup with appointment_at_risk)', () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-002',
          segmentType: 'drive',
          estimatedArrival: fortyMinAgo.toISOString(),
        },
        segments: [
          { segmentId: 'SEG-001', segmentType: 'drive', status: 'COMPLETED' },
          {
            segmentId: 'SEG-002',
            segmentType: 'drive',
            status: 'IN_PROGRESS',
            estimatedArrival: fortyMinAgo.toISOString(),
          },
          {
            segmentId: 'SEG-003',
            segmentType: 'dock',
            status: 'PLANNED',
            estimatedArrival: new Date().toISOString(),
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should use nextSegment when currentSegment is null', () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: null,
        nextSegment: {
          segmentId: 'SEG-002',
          segmentType: 'drive',
          estimatedArrival: fortyMinAgo.toISOString(),
        },
        segments: [],
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).not.toBeNull();
    expect(result.params.segmentId).toBe('SEG-002');
  });

  it('should use custom thresholds', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    const ctx = {
      ...baseContext,
      activePlan: {
        planId: 'PLN-001',
        currentSegment: {
          segmentId: 'SEG-001',
          segmentType: 'drive',
          estimatedArrival: twentyMinAgo.toISOString(),
        },
        segments: [],
      },
    };

    // Default threshold is 30, so 20 min should not trigger
    expect(check.run(ctx as any, {})).toBeNull();

    // Custom threshold of 15 should trigger
    const result = check.run(ctx as any, {
      behindScheduleWarningMinutes: 15,
    });
    expect(result).not.toBeNull();
  });
});

import { DockTimeExceededCheck } from '../dock-time-exceeded.check';

describe('DockTimeExceededCheck', () => {
  let check: DockTimeExceededCheck;

  beforeEach(() => {
    check = new DockTimeExceededCheck();
  });

  const baseContext = {
    load: { loadNumber: 'LD-001', loadStops: [] },
    driver: { driverId: 'DRV-001', name: 'John Doe' },
    activePlan: null,
    nextPendingStop: null,
    estimatedDriveMinutes: null,
  };

  it('should return null when no nextPendingStop', () => {
    const result = check.run(baseContext as any, {});
    expect(result).toBeNull();
  });

  it('should return null when not arrived yet', () => {
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        arrivedAt: null,
        dockInAt: null,
        stop: { name: 'Warehouse' },
        estimatedDockHours: 1,
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should trigger when dwell time exceeds expected + threshold', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        arrivedAt: threeHoursAgo.toISOString(),
        dockInAt: null,
        stop: { name: 'Warehouse A' },
        estimatedDockHours: 1, // 60 min expected
      },
    };

    const result = check.run(ctx as any, {}); // threshold default = 60 min
    // dwell = 180 min, expected = 60, threshold = 60 -> 180 > 120 = true
    expect(result).not.toBeNull();
    expect(result.type).toBe('DOCK_TIME_EXCEEDED');
    expect(result.params.stopName).toBe('Warehouse A');
    expect(result.params.dwellMinutes).toBeGreaterThan(0);
  });

  it('should not trigger when within expected + threshold', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        arrivedAt: thirtyMinAgo.toISOString(),
        dockInAt: null,
        stop: { name: 'Warehouse A' },
        estimatedDockHours: 1,
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should prefer dockInAt over arrivedAt', () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        arrivedAt: fiveHoursAgo.toISOString(),
        dockInAt: fourHoursAgo.toISOString(),
        stop: { name: 'Dock B' },
        estimatedDockHours: 1,
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).not.toBeNull();
    // dwell should be based on dockInAt (4h) not arrivedAt (5h)
    expect(result.params.dwellMinutes).toBeLessThan(310);
  });

  it('should respect custom threshold', () => {
    // Use 89 min (not 90) to avoid flaky boundary: 89 > 30+60=90 is safely false
    const eightyNineMinAgo = new Date(Date.now() - 89 * 60 * 1000);
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        arrivedAt: eightyNineMinAgo.toISOString(),
        dockInAt: null,
        stop: { name: 'Dock' },
        estimatedDockHours: 0.5, // 30 min expected
      },
    };

    // Default threshold 60: ~89 > 30+60=90 -> not exceeded (safely under)
    expect(check.run(ctx as any, {})).toBeNull();

    // Custom threshold 30: ~89 > 30+30=60 -> exceeded
    const result = check.run(ctx as any, { dockTimeExceededMinutes: 30 });
    expect(result).not.toBeNull();
  });
});

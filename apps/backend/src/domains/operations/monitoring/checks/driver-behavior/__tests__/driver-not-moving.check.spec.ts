import { DriverNotMovingCheck } from '../driver-not-moving.check';

describe('DriverNotMovingCheck', () => {
  let check: DriverNotMovingCheck;

  beforeEach(() => {
    check = new DriverNotMovingCheck();
  });

  const makeLoad = (status: string, overrides?: Record<string, any>) => ({
    status,
    loadStops: [],
    inTransitAt: null,
    ...overrides,
  });

  const baseContext = {
    driver: { driverId: 'DRV-001', name: 'John Doe' },
    loads: [],
    gpsData: null,
    hosData: null,
  };

  it('should return null when no GPS data', () => {
    const ctx = { ...baseContext, loads: [makeLoad('IN_TRANSIT')] };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should return null when no in_transit loads', () => {
    const ctx = {
      ...baseContext,
      loads: [makeLoad('ASSIGNED'), makeLoad('DELIVERED')],
      gpsData: {
        speed: 0,
        engineRunning: true,
        timestamp: new Date().toISOString(),
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should trigger when engine is off during active load', () => {
    const ctx = {
      ...baseContext,
      loads: [makeLoad('IN_TRANSIT')],
      gpsData: {
        speed: 0,
        engineRunning: false,
        timestamp: new Date().toISOString(),
      },
    };

    const result = check.run(ctx as any, {});

    expect(result).not.toBeNull();
    expect(result.type).toBe('DRIVER_NOT_MOVING');
    expect(result.severity).toBe('high');
    expect(result.params.reason).toBe('engine_off');
  });

  it('should trigger when stationary beyond threshold', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const ctx = {
      ...baseContext,
      loads: [makeLoad('IN_TRANSIT', { inTransitAt: threeHoursAgo.toISOString() })],
      gpsData: {
        speed: 0,
        engineRunning: true,
        timestamp: threeHoursAgo.toISOString(),
      },
    };

    const result = check.run(ctx as any, {}); // default threshold: 120 min

    expect(result).not.toBeNull();
    expect(result.type).toBe('DRIVER_NOT_MOVING');
    expect(result.severity).toBe('medium');
    expect(result.params.reason).toBe('stationary');
    expect(result.params.stationaryMinutes).toBeGreaterThan(120);
  });

  it('should not trigger when stationary for short time', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const ctx = {
      ...baseContext,
      loads: [makeLoad('IN_TRANSIT', { inTransitAt: tenMinAgo.toISOString() })],
      gpsData: {
        speed: 0,
        engineRunning: true,
        timestamp: tenMinAgo.toISOString(),
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should not trigger when driver is moving', () => {
    const ctx = {
      ...baseContext,
      loads: [makeLoad('IN_TRANSIT')],
      gpsData: {
        speed: 55,
        engineRunning: true,
        timestamp: new Date().toISOString(),
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should respect custom threshold', () => {
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000);
    const ctx = {
      ...baseContext,
      loads: [makeLoad('IN_TRANSIT', { inTransitAt: ninetyMinAgo.toISOString() })],
      gpsData: {
        speed: 0,
        engineRunning: true,
        timestamp: ninetyMinAgo.toISOString(),
      },
    };

    // Default threshold 120 -> not triggered
    expect(check.run(ctx as any, {})).toBeNull();

    // Custom threshold 60 -> triggered
    const result = check.run(ctx as any, { driverNotMovingMinutes: 60 });
    expect(result).not.toBeNull();
  });
});

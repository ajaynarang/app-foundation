import { AppointmentAtRiskCheck } from '../appointment-at-risk.check';
import { LoadCheckContext } from '../../../monitoring.types';

describe('AppointmentAtRiskCheck', () => {
  let check: AppointmentAtRiskCheck;

  beforeEach(() => {
    check = new AppointmentAtRiskCheck();
  });

  it('should have correct metadata', () => {
    expect(check.id).toBe('appointment_at_risk');
    expect(check.severity).toBe('high');
    expect(check.autoResolve).toBe(true);
    expect(check.needs).toContain('gps_data');
  });

  it('should return null when no next pending stop', () => {
    const ctx = makeContext({ nextPendingStop: null });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should return null when no estimated drive minutes', () => {
    const ctx = makeContext({ estimatedDriveMinutes: null });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should return null when stop has no appointment date', () => {
    const ctx = makeContext({
      nextPendingStop: makeStop({ appointmentDate: null }),
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should return null when stop has no latest arrival', () => {
    const ctx = makeContext({
      nextPendingStop: makeStop({ latestArrival: null }),
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should return null when ETA is well within window', () => {
    const futureDate = new Date(Date.now() + 120 * 60000); // 2 hours
    const ctx = makeContext({
      estimatedDriveMinutes: 30,
      nextPendingStop: makeStop({
        appointmentDate: futureDate,
        latestArrival: `${futureDate.getHours()}:${String(futureDate.getMinutes()).padStart(2, '0')}`,
      }),
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should trigger when ETA exceeds deadline minus buffer', () => {
    const futureDate = new Date(Date.now() + 40 * 60000); // 40 min from now
    const ctx = makeContext({
      estimatedDriveMinutes: 35, // 35 min drive > 40 - 30 buffer = 10 min
      nextPendingStop: makeStop({
        appointmentDate: futureDate,
        latestArrival: `${futureDate.getHours()}:${String(futureDate.getMinutes()).padStart(2, '0')}`,
      }),
    });
    const result = check.run(ctx, {});
    expect(result).not.toBeNull();
    expect(result.type).toBe('APPOINTMENT_AT_RISK');
    expect(result.severity).toBe('high');
    expect(result.params.loadId).toBe('LD-1');
  });

  it('should return null when deadline has passed (minutesUntilDeadline <= 0)', () => {
    const pastDate = new Date(Date.now() - 10 * 60000); // 10 min ago
    const ctx = makeContext({
      estimatedDriveMinutes: 5,
      nextPendingStop: makeStop({
        appointmentDate: pastDate,
        latestArrival: `${pastDate.getHours()}:${String(pastDate.getMinutes()).padStart(2, '0')}`,
      }),
    });
    expect(check.run(ctx, {})).toBeNull();
  });

  it('should use custom threshold', () => {
    const futureDate = new Date(Date.now() + 50 * 60000);
    const ctx = makeContext({
      estimatedDriveMinutes: 15,
      nextPendingStop: makeStop({
        appointmentDate: futureDate,
        latestArrival: `${futureDate.getHours()}:${String(futureDate.getMinutes()).padStart(2, '0')}`,
      }),
    });
    // Default threshold 30 -> 15 > 50-30=20? No
    expect(check.run(ctx, {})).toBeNull();
    // Custom threshold 40 -> 15 > 50-40=10? Yes
    const result = check.run(ctx, { appointmentAtRiskMinutes: 40 });
    expect(result).not.toBeNull();
  });

  it('should use plan-aware ETA when active plan present', () => {
    const futureDate = new Date(Date.now() + 60 * 60000);
    const ctx = makeContext({
      estimatedDriveMinutes: 10, // Without plan, this is fine
      nextPendingStop: makeStop({
        appointmentDate: futureDate,
        latestArrival: `${futureDate.getHours()}:${String(futureDate.getMinutes()).padStart(2, '0')}`,
      }),
      activePlan: {
        planId: 'plan-1',
        segments: [
          {
            segmentId: 's-1',
            sequenceOrder: 1,
            segmentType: 'drive',
            status: 'PLANNED',
            driveTimeHours: 0.5,
          },
          {
            segmentId: 's-2',
            sequenceOrder: 2,
            segmentType: 'rest',
            status: 'PLANNED',
            restDurationHours: 0.5,
          },
          {
            segmentId: 's-3',
            sequenceOrder: 3,
            segmentType: 'dock',
            status: 'PLANNED',
          },
        ] as any,
        departureTime: new Date(),
        estimatedArrival: futureDate,
      },
    });
    // Plan total = 30 drive + 30 rest = 60 min > 60-30=30 ? Yes
    const result = check.run(ctx, {});
    expect(result).not.toBeNull();
    expect(result.params.planAware).toBe(true);
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
    nextPendingStop: makeStop(),
    driverPosition: { lat: 40.7, lon: -74.0 },
    estimatedDriveMinutes: 30,
    ...overrides,
  };
}

function makeStop(overrides: any = {}): any {
  const futureDate = new Date(Date.now() + 90 * 60000);
  return {
    id: 1,
    sequenceOrder: 1,
    actionType: 'delivery',
    status: 'PENDING',
    appointmentDate: futureDate,
    earliestArrival: '08:00',
    latestArrival: `${futureDate.getHours()}:${String(futureDate.getMinutes()).padStart(2, '0')}`,
    estimatedDockHours: 1,
    arrivedAt: null,
    departedAt: null,
    completedAt: null,
    dockInAt: null,
    stop: {
      lat: 40.8,
      lon: -74.1,
      name: 'Warehouse A',
      city: 'NYC',
      state: 'NY',
    },
    ...overrides,
  };
}

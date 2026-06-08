import { DriveLimitCheck } from '../checks/hos/drive-limit.check';
import { DutyLimitCheck } from '../checks/hos/duty-limit.check';
import { BreakRequiredCheck } from '../checks/hos/break-required.check';
import { CycleLimitCheck } from '../checks/hos/cycle-limit.check';
import { HosViolationCheck } from '../checks/hos/hos-violation.check';
import { AppointmentAtRiskCheck } from '../checks/load-progress/appointment-at-risk.check';
import { MissedAppointmentCheck } from '../checks/load-progress/missed-appointment.check';
import { DockTimeExceededCheck } from '../checks/load-progress/dock-time-exceeded.check';
import { OffPaceCheck } from '../checks/load-progress/off-pace.check';
import { PlanBehindScheduleCheck } from '../checks/load-progress/plan-behind-schedule.check';
import { PlanMissedStopCheck } from '../checks/load-progress/plan-missed-stop.check';
import { PlanSegmentStalledCheck } from '../checks/load-progress/plan-segment-stalled.check';
import { DriverNotMovingCheck } from '../checks/driver-behavior/driver-not-moving.check';
import { FuelLowCheck } from '../checks/vehicle-state/fuel-low.check';
import { UnconfirmedPickupCheck } from '../checks/lifecycle/unconfirmed-pickup.check';
import { UnconfirmedDeliveryCheck } from '../checks/lifecycle/unconfirmed-delivery.check';
import { NoPickupActivityCheck } from '../checks/lifecycle/no-pickup-activity.check';
import {
  DriverCheckContext,
  LoadCheckContext,
  HOSData,
  TelematicsData,
  LoadWithStops,
  ActivePlanContext,
  ActivePlanSegment,
  DEFAULT_THRESHOLDS,
} from '../monitoring.types';

// ===================================================================
// TIME SETUP
// ===================================================================
//
// Several checks parse `latestArrival` (HH:mm) against `appointmentDate`
// (today). When tests run near midnight, offsets like -30 min wrap the HH:mm
// into the previous calendar day while appointmentDate stays "today" — so
// the combined datetime lands ~23h 30m in the *future* instead of 30m in
// the past, and all "past appointment" assertions fail.
//
// Pinning to mid-day eliminates the midnight-wrap edge case deterministically.
beforeAll(() => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  jest.useFakeTimers({ doNotFake: ['setImmediate'] }).setSystemTime(now);
});

afterAll(() => {
  jest.useRealTimers();
});

// ===================================================================
// FACTORY HELPERS — build realistic test data
// ===================================================================

const hoursMs = (h: number) => h * 3600000;
const minutesMs = (m: number) => m * 60000;
const hoursAgo = (h: number) => new Date(Date.now() - hoursMs(h));
const minutesAgo = (m: number) => new Date(Date.now() - minutesMs(m));
const hoursFromNow = (h: number) => new Date(Date.now() + hoursMs(h));

function makeHOS(overrides?: Partial<HOSData>): HOSData {
  return {
    currentDutyStatus: 'driving',
    driveTimeRemainingMs: hoursMs(8),
    shiftTimeRemainingMs: hoursMs(10),
    cycleTimeRemainingMs: hoursMs(50),
    timeUntilBreakMs: hoursMs(5),
    lastUpdated: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGPS(overrides?: Partial<TelematicsData>): TelematicsData {
  return {
    latitude: 33.749,
    longitude: -84.388,
    speed: 60,
    heading: 90,
    fuelLevel: 50,
    engineRunning: true,
    odometer: 100000,
    timestamp: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDriver(overrides?: Record<string, any>) {
  return {
    id: 1,
    driverId: 'DRV-001',
    name: 'John Smith',
    tenantId: 1,
    ...overrides,
  };
}

function makeLoadStop(overrides?: Record<string, any>) {
  return {
    id: 1,
    sequenceOrder: 1,
    actionType: 'pickup',
    status: 'PENDING',
    appointmentDate: new Date(),
    earliestArrival: '08:00',
    latestArrival: '10:00',
    estimatedDockHours: 1,
    arrivedAt: null,
    departedAt: null,
    completedAt: null,
    dockInAt: null,
    stop: {
      lat: 34.052,
      lon: -118.243,
      name: 'Warehouse A',
      city: 'Los Angeles',
      state: 'CA',
    },
    ...overrides,
  };
}

function makeLoad(overrides?: Partial<LoadWithStops>): LoadWithStops {
  return {
    id: 1,
    loadNumber: 'LD-001',
    status: 'IN_TRANSIT',
    driverId: 1,
    vehicleId: 1,
    assignedAt: hoursAgo(2),
    inTransitAt: hoursAgo(1),
    loadStops: [],
    ...overrides,
  };
}

function makeDriverContext(overrides?: Partial<DriverCheckContext>): DriverCheckContext {
  return {
    driver: makeDriver(),
    vehicle: { id: 1, vehicleId: 'VEH-001' },
    loads: [],
    hosData: makeHOS(),
    gpsData: makeGPS(),
    ...overrides,
  };
}

function makeLoadContext(overrides?: Partial<LoadCheckContext>): LoadCheckContext {
  return {
    load: makeLoad(),
    driver: makeDriver(),
    nextPendingStop: null,
    driverPosition: null,
    estimatedDriveMinutes: null,
    ...overrides,
  };
}

function makePlanSegment(overrides?: Partial<ActivePlanSegment>): ActivePlanSegment {
  return {
    segmentId: 'SEG-001',
    sequenceOrder: 1,
    segmentType: 'drive',
    status: 'IN_PROGRESS',
    fromLocation: 'Chicago, IL',
    toLocation: 'Atlanta, GA',
    estimatedArrival: hoursFromNow(5),
    estimatedDeparture: hoursAgo(1),
    distanceMiles: 300,
    driveTimeHours: 5,
    restDurationHours: null,
    progress: 0.2,
    toLat: 33.749,
    toLon: -84.388,
    ...overrides,
  };
}

function makeActivePlan(overrides?: Partial<ActivePlanContext>): ActivePlanContext {
  return {
    planId: 'RP-001',
    segments: [makePlanSegment()],
    currentSegment: makePlanSegment(),
    nextSegment: undefined,
    departureTime: hoursAgo(1),
    estimatedArrival: hoursFromNow(5),
    ...overrides,
  };
}

// ===================================================================
// HOS COMPLIANCE CHECKS
// ===================================================================

describe('HOS Compliance Checks', () => {
  describe('DriveLimitCheck', () => {
    const check = new DriveLimitCheck();

    // --- EASY ---
    it('should NOT trigger when drive time is healthy (8h remaining)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: hoursMs(8) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no HOS data available', () => {
      const ctx = makeDriverContext({ hosData: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when drive time remaining < 60min (default)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: minutesMs(45) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('HOS_APPROACHING_LIMIT');
      expect(result.params.limitType).toBe('drive');
      expect(result.params.remainingMinutes).toBe(45);
    });

    // --- MEDIUM ---
    it('should trigger at exactly 59 minutes remaining', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: minutesMs(59) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.remainingMinutes).toBe(59);
    });

    it('should NOT trigger at exactly 60 minutes remaining (boundary)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: hoursMs(1) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when drive time is 0 (violation check handles this)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: 0 }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when drive time is negative (violation territory)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: -minutesMs(30) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    // --- COMPLEX ---
    it('should respect custom threshold of 90 minutes', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: minutesMs(75) }),
      });
      const result = check.run(ctx, {
        ...DEFAULT_THRESHOLDS,
        hosApproachingMinutes: 90,
      });
      expect(result).not.toBeNull();
      expect(result.params.remainingMinutes).toBe(75);
    });

    it('should include driver name and ID in trigger params', () => {
      const ctx = makeDriverContext({
        driver: makeDriver({ driverId: 'DRV-099', name: 'Maria Garcia' }),
        hosData: makeHOS({ driveTimeRemainingMs: minutesMs(30) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.params.driverName).toBe('Maria Garcia');
      expect(result.params.driverId).toBe('DRV-099');
    });

    it('should have severity=medium and requiresReplan=false', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: minutesMs(30) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.severity).toBe('medium');
      expect(result.requiresReplan).toBe(false);
    });
  });

  describe('DutyLimitCheck', () => {
    const check = new DutyLimitCheck();

    it('should NOT trigger when duty time is healthy', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ shiftTimeRemainingMs: hoursMs(10) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when duty time < 60min', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ shiftTimeRemainingMs: minutesMs(45) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('HOS_APPROACHING_LIMIT');
      expect(result.params.limitType).toBe('duty');
    });

    it('should NOT trigger when duty time is 0', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ shiftTimeRemainingMs: 0 }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no HOS data', () => {
      const ctx = makeDriverContext({ hosData: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });

  describe('BreakRequiredCheck', () => {
    const check = new BreakRequiredCheck();

    it('should NOT trigger when break time is available', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ timeUntilBreakMs: hoursMs(3) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when break time is 0 (overdue)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ timeUntilBreakMs: 0 }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('BREAK_REQUIRED');
      expect(result.severity).toBe('high');
    });

    it('should trigger when break time is negative (past due)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ timeUntilBreakMs: -minutesMs(15) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.etaImpactMinutes).toBe(30);
    });

    it('should NOT trigger when time until break is positive (even 1ms)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ timeUntilBreakMs: 1 }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger with null HOS data', () => {
      const ctx = makeDriverContext({ hosData: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });

  describe('CycleLimitCheck', () => {
    const check = new CycleLimitCheck();

    it('should NOT trigger when cycle time is healthy (50h remaining)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ cycleTimeRemainingMs: hoursMs(50) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when cycle time < 5h (default threshold)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ cycleTimeRemainingMs: hoursMs(4) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('CYCLE_APPROACHING_LIMIT');
      expect(result.params.remainingHours).toBe(4);
    });

    it('should NOT trigger at exactly 5 hours', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ cycleTimeRemainingMs: hoursMs(5) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when cycle is 0 (violation handles)', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ cycleTimeRemainingMs: 0 }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should report remaining hours with 1 decimal', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ cycleTimeRemainingMs: hoursMs(3.5) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.params.remainingHours).toBe(3.5);
    });
  });

  describe('HosViolationCheck', () => {
    const check = new HosViolationCheck();

    it('should NOT trigger when all HOS limits positive', () => {
      const ctx = makeDriverContext({ hosData: makeHOS() });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger CRITICAL when drive time is 0', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: 0 }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.severity).toBe('critical');
      expect(result.type).toBe('HOS_VIOLATION');
      expect(result.params.violationTypes).toContain('drive');
    });

    it('should trigger when duty time is 0', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ shiftTimeRemainingMs: 0 }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.violationTypes).toContain('duty');
    });

    it('should trigger when cycle time is 0', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ cycleTimeRemainingMs: 0 }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.violationTypes).toContain('cycle');
    });

    it('should report MULTIPLE violations when drive+duty both 0', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: 0, shiftTimeRemainingMs: 0 }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.params.violationTypes).toEqual(['drive', 'duty']);
    });

    it('should report ALL three violations when everything is 0', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({
          driveTimeRemainingMs: 0,
          shiftTimeRemainingMs: 0,
          cycleTimeRemainingMs: 0,
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.params.violationTypes).toEqual(['drive', 'duty', 'cycle']);
    });

    it('should require replan with 600min ETA impact', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: 0 }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.requiresReplan).toBe(true);
      expect(result.etaImpactMinutes).toBe(600);
    });

    it('should NOT trigger with null HOS data', () => {
      const ctx = makeDriverContext({ hosData: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    // --- PLAN-AWARE ---
    it('should trigger when drive time insufficient for next plan segment', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: hoursMs(2) }),
        driverActivePlan: {
          planId: 'RP-001',
          nextDriveSegment: {
            segmentId: 'SEG-001',
            distanceMiles: 300,
            driveTimeHours: 5,
            toLocation: 'Atlanta, GA',
          },
        },
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.severity).toBe('high');
      expect(result.params.planAware).toBe(true);
      expect(result.params.planId).toBe('RP-001');
    });

    it('should NOT trigger plan-aware when drive time sufficient for next segment', () => {
      const ctx = makeDriverContext({
        hosData: makeHOS({ driveTimeRemainingMs: hoursMs(8) }),
        driverActivePlan: {
          planId: 'RP-001',
          nextDriveSegment: {
            segmentId: 'SEG-001',
            distanceMiles: 200,
            driveTimeHours: 3.5,
            toLocation: 'Nashville, TN',
          },
        },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });
});

// ===================================================================
// LOAD PROGRESS CHECKS
// ===================================================================

describe('Load Progress Checks', () => {
  describe('AppointmentAtRiskCheck', () => {
    const check = new AppointmentAtRiskCheck();

    it('should NOT trigger when no pending stop', () => {
      const ctx = makeLoadContext({ nextPendingStop: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no ETA available', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop(),
        estimatedDriveMinutes: null,
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no appointment window set', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({ latestArrival: null }),
        estimatedDriveMinutes: 60,
        driverPosition: { lat: 33, lon: -84 },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when ETA exceeds deadline minus buffer', () => {
      // Deadline in 60 minutes, ETA is 45 minutes, buffer is 30 min → 45 > (60-30) → trigger
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(60),
        }),
        estimatedDriveMinutes: 45,
        driverPosition: { lat: 33, lon: -84 },
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('APPOINTMENT_AT_RISK');
      expect(result.severity).toBe('high');
    });

    it('should NOT trigger when ETA is well within deadline', () => {
      // Deadline in 120 minutes, ETA is 30 minutes, buffer is 30 → 30 < (120-30) = 90 → no trigger
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(120),
        }),
        estimatedDriveMinutes: 30,
        driverPosition: { lat: 33, lon: -84 },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when deadline already passed (missed_appointment handles)', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(-10),
        }),
        estimatedDriveMinutes: 20,
        driverPosition: { lat: 33, lon: -84 },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    // --- PLAN-AWARE ---
    it('should use plan segment total for ETA when plan is available', () => {
      // Plan says: 2h drive + 0.5h fuel + 1h drive = 3.5h (210 min) before dock
      // Deadline in 240 min, buffer 30 min → 210 < 210 → trigger (barely)
      const driveSeg1 = makePlanSegment({
        segmentId: 'SEG-D1',
        sequenceOrder: 1,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
        driveTimeHours: 2,
        restDurationHours: null,
      });
      const fuelSeg = makePlanSegment({
        segmentId: 'SEG-F1',
        sequenceOrder: 2,
        segmentType: 'fuel',
        status: 'PLANNED',
        driveTimeHours: null,
        restDurationHours: null,
      });
      const driveSeg2 = makePlanSegment({
        segmentId: 'SEG-D2',
        sequenceOrder: 3,
        segmentType: 'drive',
        status: 'PLANNED',
        driveTimeHours: 1,
        restDurationHours: null,
      });
      const dockSeg = makePlanSegment({
        segmentId: 'SEG-DOCK',
        sequenceOrder: 4,
        segmentType: 'dock',
        status: 'PLANNED',
        driveTimeHours: null,
        restDurationHours: null,
      });

      const plan = makeActivePlan({
        segments: [driveSeg1, fuelSeg, driveSeg2, dockSeg],
        currentSegment: driveSeg1,
      });

      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(220),
        }),
        estimatedDriveMinutes: 60,
        driverPosition: { lat: 33, lon: -84 },
        activePlan: plan,
      });

      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.planAware).toBe(true);
    });
  });

  describe('MissedAppointmentCheck', () => {
    const check = new MissedAppointmentCheck();

    it('should NOT trigger when appointment is in the future', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(120),
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when appointment is in the past', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(-30),
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('MISSED_APPOINTMENT');
      expect(result.severity).toBe('critical');
      expect(result.requiresReplan).toBe(true);
    });

    it('should NOT trigger when stop is already completed', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          status: 'COMPLETED',
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(-30),
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no appointment window set', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({ latestArrival: null }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no pending stop', () => {
      const ctx = makeLoadContext({ nextPendingStop: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should report minutes past deadline as ETA impact', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(-45),
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.etaImpactMinutes).toBeGreaterThanOrEqual(44);
      expect(result.etaImpactMinutes).toBeLessThanOrEqual(46);
    });

    it('should include stop name and action type in params', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(-10),
          actionType: 'delivery',
          stop: {
            lat: 34,
            lon: -118,
            name: 'Customer Dock B',
            city: 'LA',
            state: 'CA',
          },
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.params.stopName).toBe('Customer Dock B');
      expect(result.params.actionType).toBe('delivery');
    });
  });

  describe('DockTimeExceededCheck', () => {
    const check = new DockTimeExceededCheck();

    it('should NOT trigger when driver has not arrived', () => {
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({ arrivedAt: null, dockInAt: null }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when dwell time is within expected + threshold', () => {
      // Expected: 1h dock + 60min threshold = 2h total. Arrived 90 min ago → no trigger
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          arrivedAt: minutesAgo(90),
          estimatedDockHours: 1,
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when dwell time exceeds expected + threshold', () => {
      // Expected: 1h dock + 60min threshold = 2h. Arrived 3h ago → trigger
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          arrivedAt: hoursAgo(3),
          estimatedDockHours: 1,
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('DOCK_TIME_EXCEEDED');
      expect(result.params.dwellMinutes).toBeGreaterThanOrEqual(179);
    });

    it('should use dockInAt over arrivedAt when both present', () => {
      // dockInAt is 2.5h ago (should trigger), arrivedAt is 1h ago (would not trigger)
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          arrivedAt: hoursAgo(1),
          dockInAt: hoursAgo(2.5),
          estimatedDockHours: 1,
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
    });

    it('should report correct ETA impact (overage time)', () => {
      // 3h dwell - 1h expected = 2h overage = 120 min
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          arrivedAt: hoursAgo(3),
          estimatedDockHours: 1,
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.etaImpactMinutes).toBeGreaterThanOrEqual(119);
      expect(result.etaImpactMinutes).toBeLessThanOrEqual(121);
    });

    it('should NOT trigger when no pending stop', () => {
      const ctx = makeLoadContext({ nextPendingStop: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });

  describe('OffPaceCheck', () => {
    const check = new OffPaceCheck();

    it('should NOT trigger when no pending stop and no plan', () => {
      const ctx = makeLoadContext({ nextPendingStop: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger (basic mode) when ETA exceeds deadline minus buffer', () => {
      // Deadline in 90 min, buffer 30 min, ETA 70 min → 70 > (90-30)=60 → deficit 10 → trigger
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(90),
        }),
        estimatedDriveMinutes: 70,
        driverPosition: { lat: 33, lon: -84 },
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('OFF_PACE');
    });

    it('should NOT trigger (basic mode) when well within buffer', () => {
      // Deadline in 180 min, buffer 30 min, ETA 60 min → 60 < 150 → no trigger
      const ctx = makeLoadContext({
        nextPendingStop: makeLoadStop({
          appointmentDate: new Date(),
          latestArrival: formatTimeMinutesFromNow(180),
        }),
        estimatedDriveMinutes: 60,
        driverPosition: { lat: 33, lon: -84 },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    // --- PLAN-AWARE ---
    it('should trigger (plan-aware) when actual progress < 70% of expected', () => {
      const seg = makePlanSegment({
        segmentType: 'drive',
        status: 'IN_PROGRESS',
        estimatedDeparture: hoursAgo(2),
        driveTimeHours: 4,
        progress: 0.15, // 15% actual vs 50% expected → deficit
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });

      const ctx = makeLoadContext({ activePlan: plan });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.planAware).toBe(true);
      expect(result.params.actualProgress).toBe(15);
    });

    it('should NOT trigger (plan-aware) when progress is on track', () => {
      const seg = makePlanSegment({
        segmentType: 'drive',
        status: 'IN_PROGRESS',
        estimatedDeparture: hoursAgo(1),
        driveTimeHours: 4,
        progress: 0.3, // 30% actual vs 25% expected → on track
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });

      const ctx = makeLoadContext({ activePlan: plan });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should skip plan-aware check for non-drive segments', () => {
      const seg = makePlanSegment({
        segmentType: 'rest',
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });

      const ctx = makeLoadContext({
        activePlan: plan,
        nextPendingStop: null,
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });

  describe('PlanBehindScheduleCheck', () => {
    const check = new PlanBehindScheduleCheck();

    it('should NOT trigger when no active plan', () => {
      const ctx = makeLoadContext({});
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when segment is on time', () => {
      const seg = makePlanSegment({ estimatedArrival: hoursFromNow(1) });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger at WARNING level when 30-59 min behind', () => {
      const seg = makePlanSegment({ estimatedArrival: minutesAgo(40) });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.severity).toBe('medium');
      expect(result.requiresReplan).toBe(false);
    });

    it('should trigger at CRITICAL level when 60+ min behind', () => {
      const seg = makePlanSegment({ estimatedArrival: minutesAgo(90) });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.severity).toBe('critical');
      expect(result.requiresReplan).toBe(true);
    });

    it('should suppress when near dock segment (dedup with appointment_at_risk)', () => {
      const driveSeg = makePlanSegment({
        segmentId: 'SEG-D1',
        sequenceOrder: 2,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
        estimatedArrival: minutesAgo(45),
      });
      const dockSeg = makePlanSegment({
        segmentId: 'SEG-DOCK',
        sequenceOrder: 3,
        segmentType: 'dock',
        status: 'PLANNED',
        estimatedArrival: hoursFromNow(1),
      });
      const plan = makeActivePlan({
        currentSegment: driveSeg,
        segments: [driveSeg, dockSeg],
      });
      const ctx = makeLoadContext({ activePlan: plan });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT suppress when dock is far away in sequence', () => {
      const driveSeg1 = makePlanSegment({
        segmentId: 'SEG-D1',
        sequenceOrder: 1,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
        estimatedArrival: minutesAgo(45),
      });
      const restSeg = makePlanSegment({
        segmentId: 'SEG-R1',
        sequenceOrder: 2,
        segmentType: 'rest',
        status: 'PLANNED',
      });
      const driveSeg2 = makePlanSegment({
        segmentId: 'SEG-D2',
        sequenceOrder: 3,
        segmentType: 'drive',
        status: 'PLANNED',
      });
      const dockSeg = makePlanSegment({
        segmentId: 'SEG-DOCK',
        sequenceOrder: 4,
        segmentType: 'dock',
        status: 'PLANNED',
      });
      const plan = makeActivePlan({
        currentSegment: driveSeg1,
        segments: [driveSeg1, restSeg, driveSeg2, dockSeg],
      });
      const ctx = makeLoadContext({ activePlan: plan });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
    });
  });

  describe('PlanMissedStopCheck', () => {
    const check = new PlanMissedStopCheck();

    it('should NOT trigger when no active plan', () => {
      const ctx = makeLoadContext({});
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no driver position', () => {
      const plan = makeActivePlan();
      const ctx = makeLoadContext({ activePlan: plan, driverPosition: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when driver passed a planned fuel stop', () => {
      // Driver is at (35.0, -85.0), fuel stop was at (34.0, -84.0) = ~87 miles away
      // Fuel stop is sequence 1 (planned), current segment is sequence 2
      const fuelSeg = makePlanSegment({
        segmentId: 'SEG-FUEL',
        sequenceOrder: 1,
        segmentType: 'fuel',
        status: 'PLANNED',
        toLat: 34.0,
        toLon: -84.0,
      });
      const currentSeg = makePlanSegment({
        segmentId: 'SEG-DRIVE',
        sequenceOrder: 2,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({
        currentSegment: currentSeg,
        segments: [fuelSeg, currentSeg],
      });
      const ctx = makeLoadContext({
        activePlan: plan,
        driverPosition: { lat: 35.0, lon: -85.0, speed: 60 },
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('PLAN_MISSED_STOP');
      expect(result.requiresReplan).toBe(true);
    });

    it('should NOT trigger when driver is near the planned stop (within threshold)', () => {
      // Driver at (34.01, -84.01), fuel stop at (34.0, -84.0) = ~0.9 miles → within 2 mile threshold
      const fuelSeg = makePlanSegment({
        segmentId: 'SEG-FUEL',
        sequenceOrder: 1,
        segmentType: 'fuel',
        status: 'PLANNED',
        toLat: 34.0,
        toLon: -84.0,
      });
      const currentSeg = makePlanSegment({
        segmentId: 'SEG-DRIVE',
        sequenceOrder: 2,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({
        currentSegment: currentSeg,
        segments: [fuelSeg, currentSeg],
      });
      const ctx = makeLoadContext({
        activePlan: plan,
        driverPosition: { lat: 34.01, lon: -84.01, speed: 60 },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when driver is stopped (speed < 5)', () => {
      const fuelSeg = makePlanSegment({
        segmentId: 'SEG-FUEL',
        sequenceOrder: 1,
        segmentType: 'fuel',
        status: 'PLANNED',
        toLat: 34.0,
        toLon: -84.0,
      });
      const currentSeg = makePlanSegment({
        segmentId: 'SEG-DRIVE',
        sequenceOrder: 2,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({
        currentSegment: currentSeg,
        segments: [fuelSeg, currentSeg],
      });
      const ctx = makeLoadContext({
        activePlan: plan,
        driverPosition: { lat: 35.0, lon: -85.0, speed: 3 },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger for dock segments (only fuel/rest/break)', () => {
      const dockSeg = makePlanSegment({
        segmentId: 'SEG-DOCK',
        sequenceOrder: 1,
        segmentType: 'dock',
        status: 'PLANNED',
        toLat: 34.0,
        toLon: -84.0,
      });
      const currentSeg = makePlanSegment({
        segmentId: 'SEG-DRIVE',
        sequenceOrder: 2,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({
        currentSegment: currentSeg,
        segments: [dockSeg, currentSeg],
      });
      const ctx = makeLoadContext({
        activePlan: plan,
        driverPosition: { lat: 35.0, lon: -85.0, speed: 60 },
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should detect missed rest stop', () => {
      const restSeg = makePlanSegment({
        segmentId: 'SEG-REST',
        sequenceOrder: 1,
        segmentType: 'rest',
        status: 'PLANNED',
        toLat: 34.0,
        toLon: -84.0,
        restDurationHours: 10,
      });
      const currentSeg = makePlanSegment({
        segmentId: 'SEG-DRIVE',
        sequenceOrder: 2,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({
        currentSegment: currentSeg,
        segments: [restSeg, currentSeg],
      });
      const ctx = makeLoadContext({
        activePlan: plan,
        driverPosition: { lat: 36.0, lon: -86.0, speed: 55 },
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.segmentType).toBe('rest');
      expect(result.etaImpactMinutes).toBe(600);
    });
  });

  describe('PlanSegmentStalledCheck', () => {
    const check = new PlanSegmentStalledCheck();

    it('should NOT trigger when no active plan', () => {
      const ctx = makeLoadContext({});
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no current segment', () => {
      const plan = makeActivePlan({ currentSegment: undefined });
      const ctx = makeLoadContext({ activePlan: plan });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger for dock segments', () => {
      const seg = makePlanSegment({
        segmentType: 'dock',
        estimatedDeparture: hoursAgo(5),
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when drive segment takes 2x+ expected', () => {
      // 3h drive segment, started 7h ago → elapsed > 2 * expected
      const seg = makePlanSegment({
        segmentType: 'drive',
        driveTimeHours: 3,
        estimatedDeparture: hoursAgo(7),
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('PLAN_SEGMENT_STALLED');
      expect(result.requiresReplan).toBe(true);
      expect(result.etaImpactMinutes).toBeGreaterThanOrEqual(239);
    });

    it('should NOT trigger when segment is within expected time', () => {
      const seg = makePlanSegment({
        segmentType: 'drive',
        driveTimeHours: 5,
        estimatedDeparture: hoursAgo(3),
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should detect stalled rest segment', () => {
      // 10h rest, started 21h ago → 21 > 2 * 10 = 20 → stalled
      const seg = makePlanSegment({
        segmentType: 'rest',
        restDurationHours: 10,
        estimatedDeparture: hoursAgo(21),
        status: 'IN_PROGRESS',
        driveTimeHours: null,
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.segmentType).toBe('rest');
    });

    it('should detect stalled fuel segment (default 30min expected)', () => {
      // Fuel stop, started 1.5h ago → 90min > 2 * 30min = 60min → stalled
      const seg = makePlanSegment({
        segmentType: 'fuel',
        driveTimeHours: null,
        restDurationHours: null,
        estimatedDeparture: minutesAgo(90),
        status: 'IN_PROGRESS',
      });
      const plan = makeActivePlan({ currentSegment: seg, segments: [seg] });
      const ctx = makeLoadContext({ activePlan: plan });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
    });
  });
});

// ===================================================================
// DRIVER BEHAVIOR CHECKS
// ===================================================================

describe('Driver Behavior Checks', () => {
  describe('DriverNotMovingCheck', () => {
    const check = new DriverNotMovingCheck();

    it('should NOT trigger when no GPS data', () => {
      const ctx = makeDriverContext({ gpsData: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no in-transit loads', () => {
      const ctx = makeDriverContext({
        loads: [makeLoad({ status: 'ASSIGNED' })],
        gpsData: makeGPS({ speed: 0, engineRunning: false }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when engine is off during in-transit load', () => {
      const ctx = makeDriverContext({
        loads: [makeLoad({ status: 'IN_TRANSIT' })],
        gpsData: makeGPS({ engineRunning: false }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('DRIVER_NOT_MOVING');
      expect(result.params.reason).toBe('engine_off');
      expect(result.severity).toBe('high');
    });

    it('should NOT trigger when speed is 0 but driver is at a dock', () => {
      const ctx = makeDriverContext({
        loads: [
          makeLoad({
            status: 'IN_TRANSIT',
            loadStops: [
              makeLoadStop({
                arrivedAt: hoursAgo(1),
                departedAt: null,
                completedAt: null,
              }),
            ],
          }),
        ],
        gpsData: makeGPS({ speed: 0, timestamp: hoursAgo(3).toISOString() }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when stationary too long and NOT at a dock', () => {
      const ctx = makeDriverContext({
        loads: [
          makeLoad({
            status: 'IN_TRANSIT',
            inTransitAt: hoursAgo(5),
            loadStops: [],
          }),
        ],
        gpsData: makeGPS({
          speed: 0,
          timestamp: hoursAgo(3).toISOString(),
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.reason).toBe('stationary');
      expect(result.params.stationaryMinutes).toBeGreaterThanOrEqual(179);
    });

    it('should NOT trigger when speed > 0', () => {
      const ctx = makeDriverContext({
        loads: [makeLoad({ status: 'IN_TRANSIT' })],
        gpsData: makeGPS({ speed: 55 }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when stationary for less than threshold', () => {
      const ctx = makeDriverContext({
        loads: [
          makeLoad({
            status: 'IN_TRANSIT',
            inTransitAt: minutesAgo(30),
            loadStops: [],
          }),
        ],
        gpsData: makeGPS({ speed: 0, timestamp: minutesAgo(30).toISOString() }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });
});

// ===================================================================
// VEHICLE STATE CHECKS
// ===================================================================

describe('Vehicle State Checks', () => {
  describe('FuelLowCheck', () => {
    const check = new FuelLowCheck();

    it('should NOT trigger when fuel is above threshold', () => {
      const ctx = makeDriverContext({ gpsData: makeGPS({ fuelLevel: 50 }) });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when fuel is below threshold', () => {
      const ctx = makeDriverContext({ gpsData: makeGPS({ fuelLevel: 15 }) });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('FUEL_LOW');
      expect(result.params.fuelLevel).toBe(15);
    });

    it('should NOT trigger when fuel is exactly at threshold', () => {
      const ctx = makeDriverContext({ gpsData: makeGPS({ fuelLevel: 20 }) });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when fuel is null', () => {
      const ctx = makeDriverContext({ gpsData: makeGPS({ fuelLevel: null }) });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no GPS data', () => {
      const ctx = makeDriverContext({ gpsData: null });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when no vehicle assigned', () => {
      const ctx = makeDriverContext({
        vehicle: null,
        gpsData: makeGPS({ fuelLevel: 10 }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger at fuel level 0 (empty tank)', () => {
      const ctx = makeDriverContext({ gpsData: makeGPS({ fuelLevel: 0 }) });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.fuelLevel).toBe(0);
    });

    it('should trigger at fuel level 1', () => {
      const ctx = makeDriverContext({ gpsData: makeGPS({ fuelLevel: 1 }) });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
    });

    it('should include vehicleId in params', () => {
      const ctx = makeDriverContext({
        vehicle: { id: 5, vehicleId: 'VEH-099' },
        gpsData: makeGPS({ fuelLevel: 10 }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.params.vehicleId).toBe('VEH-099');
    });

    it('should have ETA impact of 15 minutes (fuel stop delay)', () => {
      const ctx = makeDriverContext({ gpsData: makeGPS({ fuelLevel: 5 }) });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result.etaImpactMinutes).toBe(15);
    });
  });
});

// ===================================================================
// LIFECYCLE CHECKS
// ===================================================================

describe('Lifecycle Checks', () => {
  describe('UnconfirmedPickupCheck', () => {
    const check = new UnconfirmedPickupCheck();

    it('should NOT trigger when load has no pickup stops', () => {
      const ctx = makeLoadContext({ load: makeLoad({ loadStops: [] }) });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger when pickup is completed', () => {
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [makeLoadStop({ actionType: 'pickup', status: 'COMPLETED' })],
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when pickup is past expected completion time', () => {
      // Appointment deadline was 3h ago, dock time is 1h, so expected completion was 2h ago
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [
            makeLoadStop({
              actionType: 'pickup',
              status: 'PENDING',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(-180),
              estimatedDockHours: 1,
            }),
          ],
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('UNCONFIRMED_PICKUP');
    });

    it('should NOT trigger when pickup deadline has not passed', () => {
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [
            makeLoadStop({
              actionType: 'pickup',
              status: 'PENDING',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(120),
              estimatedDockHours: 1,
            }),
          ],
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger for delivery stops', () => {
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [
            makeLoadStop({
              actionType: 'delivery',
              status: 'PENDING',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(-180),
              estimatedDockHours: 1,
            }),
          ],
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should check stops in sequence order and return first match', () => {
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [
            makeLoadStop({
              sequenceOrder: 2,
              actionType: 'pickup',
              status: 'PENDING',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(-180),
              estimatedDockHours: 1,
              stop: {
                lat: 34,
                lon: -118,
                name: 'Stop B',
                city: 'LA',
                state: 'CA',
              },
            }),
            makeLoadStop({
              sequenceOrder: 1,
              actionType: 'pickup',
              status: 'PENDING',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(120),
              estimatedDockHours: 1,
              stop: {
                lat: 34,
                lon: -118,
                name: 'Stop A',
                city: 'LA',
                state: 'CA',
              },
            }),
          ],
        }),
      });
      // Stop 1 (seq 1) is not past due → skip. Stop 2 (seq 2) is past due → trigger
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.stopName).toBe('Stop B');
    });
  });

  describe('UnconfirmedDeliveryCheck', () => {
    const check = new UnconfirmedDeliveryCheck();

    it('should NOT trigger when load has no delivery stops', () => {
      const ctx = makeLoadContext({ load: makeLoad({ loadStops: [] }) });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when delivery past expected completion', () => {
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [
            makeLoadStop({
              actionType: 'delivery',
              status: 'PENDING',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(-180),
              estimatedDockHours: 1,
            }),
          ],
        }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('UNCONFIRMED_DELIVERY');
    });

    it('should NOT trigger when delivery is completed', () => {
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [
            makeLoadStop({
              actionType: 'delivery',
              status: 'COMPLETED',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(-180),
            }),
          ],
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger for pickup stops', () => {
      const ctx = makeLoadContext({
        load: makeLoad({
          loadStops: [
            makeLoadStop({
              actionType: 'pickup',
              status: 'PENDING',
              appointmentDate: new Date(),
              latestArrival: formatTimeMinutesFromNow(-180),
              estimatedDockHours: 1,
            }),
          ],
        }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });

  describe('NoPickupActivityCheck', () => {
    const check = new NoPickupActivityCheck();

    it('should NOT trigger for in-transit loads', () => {
      const ctx = makeLoadContext({ load: makeLoad({ status: 'IN_TRANSIT' }) });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger for recently assigned loads', () => {
      const ctx = makeLoadContext({
        load: makeLoad({ status: 'ASSIGNED', assignedAt: hoursAgo(1) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when assigned for > 4h with no activity', () => {
      const ctx = makeLoadContext({
        load: makeLoad({ status: 'ASSIGNED', assignedAt: hoursAgo(5) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.type).toBe('NO_PICKUP_ACTIVITY');
      expect(result.params.hoursSinceAssignment).toBeGreaterThanOrEqual(4.9);
    });

    it('should NOT trigger at exactly 4 hours', () => {
      // Use 3.9h (not 4h) to avoid flaky boundary on slow CI runners
      const ctx = makeLoadContext({
        load: makeLoad({ status: 'ASSIGNED', assignedAt: hoursAgo(3.9) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should trigger when assigned for 24h+ (overnight forgotten)', () => {
      const ctx = makeLoadContext({
        load: makeLoad({ status: 'ASSIGNED', assignedAt: hoursAgo(24) }),
      });
      const result = check.run(ctx, DEFAULT_THRESHOLDS);
      expect(result).not.toBeNull();
      expect(result.params.hoursSinceAssignment).toBeGreaterThanOrEqual(23.9);
    });

    it('should NOT trigger when assignedAt is null', () => {
      const ctx = makeLoadContext({
        load: makeLoad({ status: 'ASSIGNED', assignedAt: null }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });

    it('should NOT trigger for delivered loads', () => {
      const ctx = makeLoadContext({
        load: makeLoad({ status: 'DELIVERED', assignedAt: hoursAgo(48) }),
      });
      expect(check.run(ctx, DEFAULT_THRESHOLDS)).toBeNull();
    });
  });
});

// ===================================================================
// CHECK METADATA VALIDATION
// ===================================================================

describe('Check Metadata', () => {
  const allChecks = [
    new DriveLimitCheck(),
    new DutyLimitCheck(),
    new BreakRequiredCheck(),
    new CycleLimitCheck(),
    new HosViolationCheck(),
    new AppointmentAtRiskCheck(),
    new MissedAppointmentCheck(),
    new DockTimeExceededCheck(),
    new OffPaceCheck(),
    new PlanBehindScheduleCheck(),
    new PlanMissedStopCheck(),
    new PlanSegmentStalledCheck(),
    new DriverNotMovingCheck(),
    new FuelLowCheck(),
    new UnconfirmedPickupCheck(),
    new UnconfirmedDeliveryCheck(),
    new NoPickupActivityCheck(),
  ];

  it('should have exactly 17 checks', () => {
    expect(allChecks).toHaveLength(17);
  });

  it('should have unique IDs across all checks', () => {
    const ids = allChecks.map((c) => c.id);
    expect(new Set(ids).size).toBe(17);
  });

  it('every check should have a non-empty displayName', () => {
    for (const check of allChecks) {
      expect(check.displayName.length).toBeGreaterThan(0);
    }
  });

  it('every check should have a valid category', () => {
    const validCategories = ['hos_compliance', 'load_progress', 'driver_behavior', 'vehicle_state', 'lifecycle'];
    for (const check of allChecks) {
      expect(validCategories).toContain(check.category);
    }
  });

  it('every check should have a valid scope', () => {
    for (const check of allChecks) {
      expect(['per-driver', 'per-load']).toContain(check.scope);
    }
  });

  it('every check should have a valid severity', () => {
    for (const check of allChecks) {
      expect(['critical', 'high', 'medium', 'low']).toContain(check.severity);
    }
  });

  it('per-driver checks: 7 (HOS 5 + behavior 1 + vehicle 1)', () => {
    const perDriver = allChecks.filter((c) => c.scope === 'per-driver');
    expect(perDriver).toHaveLength(7);
  });

  it('per-load checks: 10', () => {
    const perLoad = allChecks.filter((c) => c.scope === 'per-load');
    expect(perLoad).toHaveLength(10);
  });

  it('critical checks (never auto-resolve): missed_appointment, hos_violation, plan_missed_stop', () => {
    const neverAutoResolve = allChecks.filter((c) => !c.autoResolve);
    expect(neverAutoResolve.map((c) => c.id).sort()).toEqual([
      'hos_violation',
      'missed_appointment',
      'plan_missed_stop',
    ]);
  });
});

// ===================================================================
// HELPER: format time as HH:mm for appointment checks
// ===================================================================

function formatTimeMinutesFromNow(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

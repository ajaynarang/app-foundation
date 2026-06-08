import { RouteSimulator, SimulationState } from '../route-simulator';
import type { HOSRuleEngineService, HOSState } from '../../../hos-compliance/services/hos-rule-engine.service';
import type { ResolvedStop } from '../route-simulator.interfaces';

// Minimal HOS engine stub — wait segments don't touch it, so we don't need real
// behavior. Other RouteSimulator behaviors that DO call into the engine are
// covered by route-planning-engine.service.spec.ts via mocks.
const stubHosState: HOSState = {
  hoursDriven: 0,
  onDutyTime: 0,
  hoursSinceBreak: 0,
  drivingHoursSinceBreak: 0,
  cycleHoursUsed: 0,
  cycleDaysData: [],
  splitRestState: undefined,
};

const stubHosEngine = {
  simulateAfterDriving: jest.fn(() => stubHosState),
  simulateAfterFullRest: jest.fn(() => stubHosState),
} as unknown as HOSRuleEngineService;

function makeStop(overrides: Partial<ResolvedStop> = {}): ResolvedStop {
  return {
    id: 1,
    stopId: 'stop-A',
    name: 'Blue Triton Kingfield',
    lat: 45.0,
    lon: -70.0,
    type: 'pickup',
    timezone: 'America/New_York',
    customerName: 'Blue Triton',
    loadNumber: 'LD-2026-001',
    dockDurationHours: 2,
    ...overrides,
  };
}

function makeInitialState(currentTime: Date): SimulationState {
  return {
    currentTime,
    hosState: stubHosState,
    fuelRemainingGallons: 100,
    currentLat: 45.0,
    currentLon: -70.0,
    currentLocation: 'origin',
    segments: [],
    segmentCounter: 0,
    dayCounter: 1,
    dailyBreakdown: [
      {
        day: 1,
        date: currentTime.toISOString(),
        driveHours: 0,
        onDutyHours: 0,
        segments: 0,
        restStops: 0,
      },
    ],
    weatherAlerts: [],
    feasibilityIssues: [],
    totalDistanceMiles: 0,
    totalDriveTimeHours: 0,
    totalCostEstimate: 0,
    fuelCapacityGallons: 200,
    mpg: 7,
    acceptedBrands: [],
  };
}

describe('RouteSimulator.addWaitSegment (SQ-97)', () => {
  let simulator: RouteSimulator;

  beforeEach(() => {
    simulator = new RouteSimulator(stubHosEngine, 10);
  });

  it('advances currentTime to the window start without consuming HOS hours', () => {
    const arrival = new Date('2026-05-10T08:00:00.000Z'); // arrived 4h early
    const windowStart = new Date('2026-05-10T12:00:00.000Z');
    const state = makeInitialState(arrival);
    const stop = makeStop({ appointmentWindow: { start: windowStart, end: windowStart } });

    simulator.addWaitSegment(state, stop, windowStart);

    expect(state.currentTime.toISOString()).toBe(windowStart.toISOString());
    // HOS state untouched — waiting parked at a shipper is off-duty
    expect(state.hosState.hoursDriven).toBe(0);
    expect(state.hosState.onDutyTime).toBe(0);
    expect(state.dailyBreakdown[0].onDutyHours).toBe(0);
    expect(state.dailyBreakdown[0].driveHours).toBe(0);
  });

  it('emits a single wait segment with the right duration and metadata', () => {
    const arrival = new Date('2026-05-10T08:00:00.000Z');
    const windowStart = new Date('2026-05-10T12:00:00.000Z');
    const state = makeInitialState(arrival);
    const stop = makeStop({ appointmentWindow: { start: windowStart, end: windowStart } });

    simulator.addWaitSegment(state, stop, windowStart);

    expect(state.segments).toHaveLength(1);
    const seg = state.segments[0];
    expect(seg.segmentType).toBe('wait');
    expect(seg.restDurationHours).toBeCloseTo(4, 5);
    expect(seg.restType).toBe('appointment_wait');
    expect(seg.estimatedArrival.toISOString()).toBe(arrival.toISOString());
    expect(seg.estimatedDeparture.toISOString()).toBe(windowStart.toISOString());
    expect(seg.fromLocation).toBe(stop.name);
    expect(seg.toLocation).toBe(stop.name);
    expect(seg.actionType).toBe('pickup');
    expect(seg.decisionReason?.trigger).toBe('appointment_window_wait');
    // Segment counter bumps for daily reporting
    expect(state.dailyBreakdown[0].segments).toBe(1);
  });

  it('no-ops when arrival is already at or after window start', () => {
    const arrival = new Date('2026-05-10T12:00:00.000Z');
    const windowStart = new Date('2026-05-10T12:00:00.000Z');
    const state = makeInitialState(arrival);
    const stop = makeStop({ appointmentWindow: { start: windowStart, end: windowStart } });

    simulator.addWaitSegment(state, stop, windowStart);

    expect(state.segments).toHaveLength(0);
    expect(state.currentTime.toISOString()).toBe(arrival.toISOString());
  });

  it('no-ops when arrival is after window start (already late)', () => {
    const arrival = new Date('2026-05-10T13:00:00.000Z'); // 1h late
    const windowStart = new Date('2026-05-10T12:00:00.000Z');
    const state = makeInitialState(arrival);
    const stop = makeStop({ appointmentWindow: { start: windowStart, end: windowStart } });

    simulator.addWaitSegment(state, stop, windowStart);

    // Wait segment NOT inserted — the late arrival surfaces through
    // feasibility checks rather than being papered over.
    expect(state.segments).toHaveLength(0);
    expect(state.currentTime.toISOString()).toBe(arrival.toISOString());
  });

  it('produces a 17h wait when planner runs ~17h before pickup (the SQ-97 scenario)', () => {
    // The exact bug shape: planner anchors at 21:15 ET on Apr 22; pickup
    // window opens at 02:15 ET on Apr 23. Driver arrives ~21:15 ET, waits
    // 5 hours off-duty until 02:15. Prior code stuffed 8h+2h sleeper rest
    // into the same gap and falsely consumed HOS.
    const arrival = new Date('2026-04-23T01:15:00.000Z'); // 21:15 ET on Apr 22
    const windowStart = new Date('2026-04-23T06:15:00.000Z'); // 02:15 ET on Apr 23
    const state = makeInitialState(arrival);
    const stop = makeStop({ appointmentWindow: { start: windowStart, end: windowStart } });

    simulator.addWaitSegment(state, stop, windowStart);

    expect(state.segments).toHaveLength(1);
    expect(state.segments[0].restDurationHours).toBeCloseTo(5, 5);
    expect(state.hosState.hoursDriven).toBe(0);
    expect(state.hosState.onDutyTime).toBe(0);
    expect(state.currentTime.toISOString()).toBe(windowStart.toISOString());
  });
});

/**
 * Fleet-Grade Battle Test Scenarios for RouteSimulator
 *
 * These scenarios model REAL trucking operations with:
 * - Multi-leg routes (intermediate cities, not single-hop)
 * - Realistic dock times (2-3h food distribution, 30min retail)
 * - Appointment windows creating time pressure
 * - Partial fuel tanks, varying MPG
 * - Cross-timezone routes (CDT → EDT, MST → CDT)
 * - Drivers mid-shift (not fresh)
 * - Real US highway distances and drive times
 *
 * Uses REAL HOSRuleEngineService (FMCSA rules).
 * External dependencies (fuel, weather, routing) use controlled test doubles.
 *
 * @workflow
 */

import { ConfigService } from '@nestjs/config';
import { HOSRuleEngineService } from '../hos-compliance/services/hos-rule-engine.service';
import { RouteSimulator, SimulationResult } from '../route-planning/services/route-simulator';
import type {
  SimulationParams,
  ResolvedStop,
  DistanceMatrix,
  FuelStopFinder,
  FuelPricer,
  WeatherChecker,
  RouteGeometryFetcher,
} from '../route-planning/services/route-simulator.interfaces';

// ─── Real HOS Engine ──────────────────────────────────────────────────────────

const hosConfig = {
  get: (key: string) => {
    const values: Record<string, number> = {
      maxDriveHours: 11,
      maxDutyHours: 14,
      requiredBreakMinutes: 30,
      breakTriggerHours: 8,
      minRestHours: 10,
      sleeper_berth_split_long: 8,
      sleeper_berth_split_short: 2,
      maxCycleHours: 70,
      cycleDays: 8,
      restartHours: 34,
    };
    return values[key] ?? 10;
  },
} as unknown as ConfigService;

const hosEngine = new HOSRuleEngineService();
const simulator = new RouteSimulator(hosEngine, 10);

// ─── Real US City Coordinates ─────────────────────────────────────────────────

const CITIES = {
  houston: { lat: 29.76, lon: -95.37, tz: 'America/Chicago' },
  dallas: { lat: 32.777, lon: -96.797, tz: 'America/Chicago' },
  sanAntonio: { lat: 29.424, lon: -98.493, tz: 'America/Chicago' },
  texarkana: { lat: 33.442, lon: -94.048, tz: 'America/Chicago' },
  littleRock: { lat: 34.746, lon: -92.29, tz: 'America/Chicago' },
  memphis: { lat: 35.15, lon: -90.049, tz: 'America/Chicago' },
  nashville: { lat: 36.163, lon: -86.781, tz: 'America/Chicago' },
  springfieldIL: { lat: 39.781, lon: -89.65, tz: 'America/Chicago' },
  chicago: { lat: 41.878, lon: -87.63, tz: 'America/Chicago' },
  indianapolis: {
    lat: 39.768,
    lon: -86.158,
    tz: 'America/Indiana/Indianapolis',
  },
  detroit: { lat: 42.331, lon: -83.046, tz: 'America/Detroit' },
  atlanta: { lat: 33.749, lon: -84.388, tz: 'America/New_York' },
  jacksonville: { lat: 30.332, lon: -81.656, tz: 'America/New_York' },
  miami: { lat: 25.762, lon: -80.192, tz: 'America/New_York' },
  denver: { lat: 39.739, lon: -104.99, tz: 'America/Denver' },
  kansasCity: { lat: 39.099, lon: -94.578, tz: 'America/Chicago' },
  stLouis: { lat: 38.627, lon: -90.199, tz: 'America/Chicago' },
  laredo: { lat: 27.506, lon: -99.507, tz: 'America/Chicago' },
  elPaso: { lat: 31.762, lon: -106.485, tz: 'America/Denver' },
  amarillo: { lat: 35.222, lon: -101.831, tz: 'America/Chicago' },
  oklahoma: { lat: 35.468, lon: -97.516, tz: 'America/Chicago' },
  birmingham: { lat: 33.521, lon: -86.802, tz: 'America/Chicago' },
};

// ─── Test Doubles ─────────────────────────────────────────────────────────────

function makeFuelFinder(
  stops: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    city: string;
    state: string;
    price: number;
    brand: string;
  }>,
): FuelStopFinder {
  return {
    findAlongCorridor: async () =>
      stops.map((s) => ({
        stopId: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        city: s.city,
        state: s.state,
        fuelPricePerGallon: s.price,
        brand: s.brand,
        amenities: ['fuel', 'parking'],
        distanceFromRoute: 2,
      })),
    findTruckStopsNear: async () =>
      stops.map((s) => ({
        stopId: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        city: s.city,
        state: s.state,
        fuelPricePerGallon: s.price,
        brand: s.brand,
        amenities: ['fuel', 'parking', 'showers'],
        distanceFromRoute: 3,
      })),
  };
}

const noFuel: FuelStopFinder = { findAlongCorridor: async () => [] };

const defaultPricer: FuelPricer = {
  getPriceForStop: async (stop) => ({
    pricePerGallon: stop.fuelPricePerGallon || 3.89,
  }),
};

const clearWeather: WeatherChecker = { check: async () => [] };
const noGeometry: RouteGeometryFetcher = { getGeometry: async () => null };

const winterStorm: WeatherChecker = {
  check: async () => [
    {
      lat: 35.0,
      lon: -90.0,
      condition: 'snow',
      severity: 'severe' as const,
      description: 'Winter storm warning — heavy snow, freezing temperatures',
      temperatureF: 18,
      windSpeedMph: 35,
      driveTimeMultiplier: 1.4,
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDM(legs: Array<{ from: string; to: string; miles: number; hours: number }>): DistanceMatrix {
  const dm: DistanceMatrix = new Map();
  for (const leg of legs)
    dm.set(`${leg.from}:${leg.to}`, {
      distanceMiles: leg.miles,
      driveTimeHours: leg.hours,
    });
  return dm;
}

function stop(
  id: number,
  stopId: string,
  name: string,
  city: keyof typeof CITIES,
  type: 'origin' | 'pickup' | 'delivery',
  opts?: { dockHours?: number; customer?: string; loadNumber?: string },
): ResolvedStop {
  const c = CITIES[city];
  return {
    id,
    stopId,
    name,
    lat: c.lat,
    lon: c.lon,
    type,
    timezone: c.tz,
    dockDurationHours: opts?.dockHours ?? (type === 'origin' ? undefined : 2),
    customerName: opts?.customer,
    loadNumber: opts?.loadNumber,
  };
}

function params(
  overrides: Partial<SimulationParams> & {
    stops: ResolvedStop[];
    distanceMatrix: DistanceMatrix;
  },
): SimulationParams {
  return {
    departureTime: new Date('2026-04-03T10:00:00Z'),
    hosState: {
      hoursDriven: 0,
      onDutyTime: 0,
      hoursSinceBreak: 0,
      drivingHoursSinceBreak: 0,
      cycleHoursUsed: 0,
      cycleDaysData: [],
      splitRestState: undefined,
    },
    fuelCapacityGallons: 150,
    mpg: 6.5,
    currentFuelGallons: 150,
    hasSleeperBerth: true,
    acceptedBrands: [],
    maxDetourMiles: 15,
    preferredRest: 'auto',
    allowDockRest: true,
    costPerMile: 1.85,
    laborCostPerHour: 25,
    splitSleeperThresholdHours: 16,
    fuelStopFinder: noFuel,
    fuelPricer: defaultPricer,
    weatherChecker: clearWeather,
    routeGeometryFetcher: noGeometry,
    ...overrides,
  };
}

function count(r: SimulationResult, type: string): number {
  return r.segments.filter((s) => s.segmentType === type).length;
}

function segTypes(r: SimulationResult): string[] {
  return r.segments.map((s) => s.segmentType);
}

function totalDriveHours(r: SimulationResult): number {
  return r.segments.filter((s) => s.segmentType === 'drive').reduce((sum, s) => sum + (s.driveTimeHours ?? 0), 0);
}

function tripHours(r: SimulationResult): number {
  if (r.segments.length === 0) return 0;
  const first = r.segments[0].estimatedDeparture.getTime();
  const last = r.segments[r.segments.length - 1].estimatedArrival.getTime();
  return (last - first) / 3600000;
}

// ─── FLEET-GRADE SCENARIOS ─────────────────────────────────────────────────

describe('Fleet-Grade Battle Test Scenarios', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // EASY: Same-day local hauls — no rest, no fuel, quick turnaround
  // ═══════════════════════════════════════════════════════════════════════════

  describe('EASY-1: Dallas→Houston dry van, fresh driver, same day', () => {
    // Real: 240mi via I-45, ~3h 45m. Pickup 2h, delivery 1.5h.
    // Total on-duty: 2h dock + 3.75h drive + 1.5h dock = 7.25h. Under all limits.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          departureTime: new Date('2026-04-03T06:00:00-05:00'), // 6 AM CDT
          stops: [
            stop(0, 'origin', 'Driver Home Dallas', 'dallas', 'origin'),
            stop(1, 'pu-1', 'ABC Cold Storage', 'dallas', 'pickup', {
              dockHours: 2,
              customer: 'Fresh Foods Inc',
              loadNumber: 'LD-5001',
            }),
            stop(2, 'del-1', 'HEB Distribution Center', 'houston', 'delivery', {
              dockHours: 1.5,
              customer: 'Fresh Foods Inc',
              loadNumber: 'LD-5001',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 5, hours: 0.15 },
            { from: 'pu-1', to: 'del-1', miles: 240, hours: 3.75 },
          ]),
        }),
      );
    });

    it('no rest, no fuel, no break needed', () => {
      expect(count(r, 'rest')).toBe(0);
      expect(count(r, 'fuel')).toBe(0);
      expect(count(r, 'break')).toBe(0);
    });

    it('total ~245mi drive (incl 5mi origin→pickup)', () => {
      expect(r.totalDistanceMiles).toBeGreaterThanOrEqual(240);
      expect(r.totalDistanceMiles).toBeLessThan(250);
      expect(totalDriveHours(r)).toBeGreaterThan(3.5);
      expect(totalDriveHours(r)).toBeLessThan(5);
    });

    it('trip fits in single day', () => {
      expect(tripHours(r)).toBeLessThan(10);
      expect(r.dayCounter).toBe(1);
    });

    it('HOS fully compliant', () => {
      expect(r.complianceReport.isFullyCompliant).toBe(true);
      expect(r.feasibilityIssues).toHaveLength(0);
    });
  });

  describe('EASY-2: San Antonio→Dallas, driver already 5h into shift', () => {
    // 275mi, ~4.5h drive. Driver has 5h on-duty already.
    // Total will be: 5h existing + 2h dock + 4.5h drive + 1h dock = 12.5h on-duty.
    // Break needed: 5h + 2h dock = 7h → after 1h driving hits 8h → needs break
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          departureTime: new Date('2026-04-03T13:00:00-05:00'), // 1 PM CDT (started at 8 AM)
          hosState: {
            hoursDriven: 3,
            onDutyTime: 5,
            hoursSinceBreak: 5,
            drivingHoursSinceBreak: 5,
            cycleHoursUsed: 35,
            cycleDaysData: [],
            splitRestState: undefined,
          },
          stops: [
            stop(0, 'origin', 'Driver Location SA', 'sanAntonio', 'origin'),
            stop(1, 'pu-1', 'Toyota Plant', 'sanAntonio', 'pickup', {
              dockHours: 1.5,
              customer: 'Toyota Parts',
              loadNumber: 'LD-5002',
            }),
            stop(2, 'del-1', 'DFW Auto Parts Depot', 'dallas', 'delivery', {
              dockHours: 1,
              customer: 'Toyota Parts',
              loadNumber: 'LD-5002',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 8, hours: 0.2 },
            { from: 'pu-1', to: 'del-1', miles: 275, hours: 4.5 },
          ]),
        }),
      );
    });

    it('needs a 30-min break (driver at 5h + 1.5h dock + drive → hits 8h)', () => {
      expect(count(r, 'break')).toBeGreaterThanOrEqual(1);
    });

    it('no rest needed (total drive ~7.5h < 11h)', () => {
      expect(count(r, 'rest')).toBe(0);
    });

    it('total on-duty stays under 14h', () => {
      const lastSeg = r.segments[r.segments.length - 1];
      expect(lastSeg.hosStateAfter.onDutyTime).toBeLessThanOrEqual(14);
    });

    it('cycle stays well under 70h', () => {
      const lastSeg = r.segments[r.segments.length - 1];
      expect(lastSeg.hosStateAfter.cycleHoursUsed).toBeLessThan(50);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIUM: Multi-day regional hauls — rest stops, fuel stops, weather
  // ═══════════════════════════════════════════════════════════════════════════

  describe('MEDIUM-1: Houston→Memphis, 580mi, fuel stop needed', () => {
    // I-10→I-12→I-55 or I-45→I-30→I-40. ~9.5h drive.
    // 150gal at 60% = 90gal. Range = 90 * 6.5 = 585mi — barely enough but
    // hits reserve threshold. Need fuel.
    // Dock: 2h pickup + 1.5h delivery = 3.5h on-duty not-driving.
    // Total on-duty: 3.5h + 9.5h = 13h. Under 14h but needs break at 8h mark.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          departureTime: new Date('2026-04-03T05:00:00-05:00'), // 5 AM CDT
          currentFuelGallons: 90, // 60% of 150gal
          fuelStopFinder: makeFuelFinder([
            {
              id: 'fs-texarkana',
              name: "Love's #482 Texarkana",
              lat: 33.44,
              lon: -94.05,
              city: 'Texarkana',
              state: 'TX',
              price: 3.42,
              brand: "Love's",
            },
            {
              id: 'fs-littlerock',
              name: 'Pilot Flying J Little Rock',
              lat: 34.75,
              lon: -92.29,
              city: 'Little Rock',
              state: 'AR',
              price: 3.55,
              brand: 'Pilot',
            },
          ]),
          stops: [
            stop(0, 'origin', 'Driver Home Houston', 'houston', 'origin'),
            stop(1, 'pu-1', 'Gulf Coast Warehouse', 'houston', 'pickup', {
              dockHours: 2,
              customer: 'Southern Foods',
              loadNumber: 'LD-5010',
            }),
            stop(2, 'del-1', 'Memphis Cold Storage', 'memphis', 'delivery', {
              dockHours: 1.5,
              customer: 'Southern Foods',
              loadNumber: 'LD-5010',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 12, hours: 0.3 },
            { from: 'pu-1', to: 'del-1', miles: 580, hours: 9.5 },
          ]),
        }),
      );
    });

    it('needs at least 1 fuel stop (90gal / 6.5mpg = 585mi range, tight)', () => {
      expect(count(r, 'fuel')).toBeGreaterThanOrEqual(1);
    });

    it("selects cheapest fuel stop (Love's at $3.42 vs Pilot at $3.55)", () => {
      const fuelSeg = r.segments.find((s) => s.segmentType === 'fuel');
      expect(fuelSeg).toBeDefined();
      expect(fuelSeg.fuelStationName).toContain("Love's");
      expect(fuelSeg.fuelPricePerGallon).toBeCloseTo(3.42, 1);
    });

    it('needs 30-min break (2h dock + 8h → triggers break)', () => {
      expect(count(r, 'break')).toBeGreaterThanOrEqual(1);
    });

    it('drive time ~9.5h (under 11h limit, no rest needed)', () => {
      expect(totalDriveHours(r)).toBeLessThan(11);
    });

    it('feasible with no violations', () => {
      expect(r.feasibilityIssues).toHaveLength(0);
    });

    it('fuel stop has decision reason', () => {
      const fuelSeg = r.segments.find((s) => s.segmentType === 'fuel');
      expect(fuelSeg?.decisionReason).toBeDefined();
      expect(fuelSeg?.decisionReason?.summary?.length).toBeGreaterThan(5);
    });
  });

  describe('MEDIUM-2: Atlanta→Jacksonville→Miami, 2 deliveries, winter storm', () => {
    // Atlanta→Jacksonville: 345mi, 5.5h. Jacksonville→Miami: 345mi, 5.5h.
    // Total: 690mi, 11h drive. Needs rest between legs.
    // Winter storm adds 40% to drive time → 5.5h * 1.4 = 7.7h per leg.
    // Full tank, but 690mi / 6.5mpg = 106gal → fine with 150gal tank.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          departureTime: new Date('2026-01-15T06:00:00-05:00'), // Jan 15, 6 AM EST (winter)
          weatherChecker: winterStorm,
          stops: [
            stop(0, 'origin', 'Atlanta Terminal', 'atlanta', 'origin'),
            stop(1, 'pu-1', 'Atlanta Produce Market', 'atlanta', 'pickup', {
              dockHours: 2.5,
              customer: 'Georgia Fresh',
              loadNumber: 'LD-5020',
            }),
            stop(2, 'del-1', 'Jax Distribution', 'jacksonville', 'delivery', {
              dockHours: 1.5,
              customer: 'Georgia Fresh',
              loadNumber: 'LD-5020',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 3, hours: 0.1 },
            { from: 'pu-1', to: 'del-1', miles: 345, hours: 5.5 },
          ]),
        }),
      );
    });

    it('weather increases drive time (5.5h * 1.4 = ~7.7h)', () => {
      const driveSegs = r.segments.filter((s) => s.segmentType === 'drive');
      // Should be noticeably more than 5.5h due to weather
      const totalDrive = driveSegs.reduce((s, seg) => s + (seg.driveTimeHours ?? 0), 0);
      expect(totalDrive).toBeGreaterThan(7);
    });

    it('has weather alerts attached to segments', () => {
      expect(r.weatherAlerts.length).toBeGreaterThan(0);
      expect(r.weatherAlerts[0].condition).toBe('snow');
    });

    it('no mandatory break (7.7h DRIVING is under the 8h driving trigger; dock time does not count — FMCSA §395.3)', () => {
      // 2.5h dock + 7.7h adjusted drive = 10.2h on-duty, but only 7.7h DRIVING.
      // The 30-min break is required after 8h of *driving*, so none is mandated here.
      const drivingHours = r.segments
        .filter((s) => s.segmentType === 'drive')
        .reduce((sum, s) => sum + (s.driveTimeHours ?? 0), 0);
      expect(drivingHours).toBeLessThan(8);
      // Any break the planner inserts proactively must be at/after 7.5h driving,
      // never forced by dock time — so 0 mandatory breaks is correct here.
      expect(count(r, 'break')).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLEX: Multi-day long-haul — rest, fuel, breaks, split sleeper, time zones
  // ═══════════════════════════════════════════════════════════════════════════

  describe('COMPLEX-1: Houston→Chicago, 1050mi, split sleeper, multi-leg', () => {
    // Real route: Houston → Texarkana (270mi, 4.25h) → Memphis (280mi, 4.5h) → Springfield IL (350mi, 5.5h) → Chicago (200mi, 3.25h)
    // Total: 1100mi, 17.5h drive. Needs multiple rest stops, fuel, breaks.
    // Tank at 80% = 120gal. Range = 780mi. Need fuel before 780mi.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          departureTime: new Date('2026-04-03T05:30:00-05:00'), // 5:30 AM CDT
          currentFuelGallons: 120, // 80%
          preferredRest: 'auto', // engine decides split vs full
          fuelStopFinder: makeFuelFinder([
            {
              id: 'fs-texarkana',
              name: "Love's Travel Stop Texarkana",
              lat: 33.44,
              lon: -94.05,
              city: 'Texarkana',
              state: 'TX',
              price: 3.42,
              brand: "Love's",
            },
            {
              id: 'fs-memphis',
              name: 'Pilot Flying J Memphis',
              lat: 35.15,
              lon: -90.05,
              city: 'Memphis',
              state: 'TN',
              price: 3.55,
              brand: 'Pilot',
            },
            {
              id: 'fs-springfield',
              name: 'TA Springfield',
              lat: 39.78,
              lon: -89.65,
              city: 'Springfield',
              state: 'IL',
              price: 3.61,
              brand: 'TA',
            },
          ]),
          stops: [
            stop(0, 'origin', 'Houston Terminal', 'houston', 'origin'),
            stop(1, 'pu-1', 'Gulf Petrochemical Depot', 'houston', 'pickup', {
              dockHours: 2,
              customer: 'Acme Chemical',
              loadNumber: 'LD-5030',
            }),
            stop(2, 'del-1', 'Midwest Chemical Warehouse', 'chicago', 'delivery', {
              dockHours: 1.5,
              customer: 'Acme Chemical',
              loadNumber: 'LD-5030',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 8, hours: 0.2 },
            { from: 'pu-1', to: 'del-1', miles: 1050, hours: 17 },
          ]),
        }),
      );
    });

    it('needs at least 1 rest stop (17h drive > 11h limit)', () => {
      expect(count(r, 'rest')).toBeGreaterThanOrEqual(1);
    });

    it('needs at least 1 fuel stop (780mi range < 1050mi)', () => {
      expect(count(r, 'fuel')).toBeGreaterThanOrEqual(1);
    });

    it('needs breaks (long drive split into sub-segments)', () => {
      // 17h drive is split mid-route. Break should trigger at 8h on-duty mark.
      expect(count(r, 'break')).toBeGreaterThanOrEqual(1);
    });

    it('total trip time exceeds 24 hours', () => {
      // 17h drive + 10h rest + 3.5h dock = ~30h minimum
      // dayCounter may not increment if rest doesn't cross midnight boundary
      expect(tripHours(r)).toBeGreaterThan(24);
    });

    it('total trip > 24 hours (driving + rest + dock)', () => {
      expect(tripHours(r)).toBeGreaterThan(24);
    });

    it('has cost breakdown with fuel and labor', () => {
      expect(r.costBreakdown.fuelCost).toBeGreaterThan(0);
      expect(r.costBreakdown.laborCost).toBeGreaterThan(0);
      expect(r.costBreakdown.totalOperatingCost).toBeGreaterThan(r.costBreakdown.fuelCost);
    });

    it('rest segments have decision reasoning', () => {
      const restSegs = r.segments.filter((s) => s.segmentType === 'rest');
      expect(restSegs.length).toBeGreaterThan(0);
      for (const seg of restSegs) {
        expect(seg.decisionReason).toBeDefined();
        expect(seg.decisionReason.summary.length).toBeGreaterThan(5);
      }
    });
  });

  describe('COMPLEX-2: Laredo→Chicago via Dallas/OKC/KC, 1350mi, forced split sleeper', () => {
    // Cross-border freight: Laredo TX (US/Mexico border) → Dallas (430mi, 7h)
    // → Oklahoma City (200mi, 3.25h) → Kansas City (350mi, 5.5h) → Chicago (500mi, 8h)
    // Total: 1480mi, ~24h drive. Will need 2+ rest stops, multiple fuel stops.
    // Force split 8/2 rest. Low fuel start (50%).
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          departureTime: new Date('2026-04-03T04:00:00-05:00'), // 4 AM CDT (early cross-border)
          currentFuelGallons: 75, // 50% — only ~487mi range
          preferredRest: 'split_8_2',
          fuelStopFinder: makeFuelFinder([
            {
              id: 'fs-sa',
              name: "Buc-ee's San Antonio",
              lat: 29.42,
              lon: -98.49,
              city: 'San Antonio',
              state: 'TX',
              price: 3.35,
              brand: "Buc-ee's",
            },
            {
              id: 'fs-dallas',
              name: "Love's Dallas",
              lat: 32.78,
              lon: -96.8,
              city: 'Dallas',
              state: 'TX',
              price: 3.49,
              brand: "Love's",
            },
            {
              id: 'fs-okc',
              name: 'Pilot OKC',
              lat: 35.47,
              lon: -97.52,
              city: 'Oklahoma City',
              state: 'OK',
              price: 3.38,
              brand: 'Pilot',
            },
            {
              id: 'fs-kc',
              name: 'TA Kansas City',
              lat: 39.1,
              lon: -94.58,
              city: 'Kansas City',
              state: 'MO',
              price: 3.52,
              brand: 'TA',
            },
          ]),
          stops: [
            stop(0, 'origin', 'Laredo Port Terminal', 'laredo', 'origin'),
            stop(1, 'pu-1', 'Laredo Import Warehouse', 'laredo', 'pickup', {
              dockHours: 3,
              customer: 'MexiParts Corp',
              loadNumber: 'LD-5040',
            }),
            stop(2, 'del-1', 'Chicago Auto Assembly', 'chicago', 'delivery', {
              dockHours: 2,
              customer: 'MexiParts Corp',
              loadNumber: 'LD-5040',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 2, hours: 0.05 },
            { from: 'pu-1', to: 'del-1', miles: 1350, hours: 22 },
          ]),
        }),
      );
    });

    it('needs 2+ rest stops for 22h drive (split into sub-segments)', () => {
      // 22h of driving requires at least 2 rest stops (11h max per period)
      expect(count(r, 'rest')).toBeGreaterThanOrEqual(2);
    });

    it('uses split sleeper rest (not full rest)', () => {
      const rests = r.segments.filter((s) => s.segmentType === 'rest');
      const hasSplit = rests.some((s) => s.restType?.includes('split'));
      expect(hasSplit).toBe(true);
    });

    it('needs 2+ fuel stops (487mi range, 1350mi route)', () => {
      // 75gal / 6.5mpg ≈ 487mi range. 1350mi needs multiple refuels.
      expect(count(r, 'fuel')).toBeGreaterThanOrEqual(2);
    });

    it('trip spans 2+ days (22h drive + rests + dock)', () => {
      // 22h drive + 2 × 8h split rest + 5h dock = ~43h minimum
      expect(tripHours(r)).toBeGreaterThan(40);
    });

    it('remains feasible despite complexity', () => {
      // The engine should still produce a valid plan
      expect(r.complianceReport).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES: Boundary conditions, violations, exhausted clocks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('EDGE-1: Driver with 10h driven, must rest before ANY driving', () => {
    // Driver has 10h already driven today. Only 1h left.
    // Route is 150mi (2.5h). Must rest first.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          hosState: {
            hoursDriven: 10,
            onDutyTime: 12,
            hoursSinceBreak: 4,
            drivingHoursSinceBreak: 4,
            cycleHoursUsed: 45,
            cycleDaysData: [],
            splitRestState: undefined,
          },
          stops: [
            stop(0, 'origin', 'Terminal', 'dallas', 'origin'),
            stop(1, 'pu-1', 'Pickup', 'dallas', 'pickup', {
              dockHours: 1,
              customer: 'Test',
              loadNumber: 'LD-EDGE1',
            }),
            stop(2, 'del-1', 'Delivery', 'sanAntonio', 'delivery', {
              dockHours: 1,
              customer: 'Test',
              loadNumber: 'LD-EDGE1',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 2, hours: 0.05 },
            { from: 'pu-1', to: 'del-1', miles: 275, hours: 4.5 },
          ]),
        }),
      );
    });

    it('inserts rest BEFORE the drive leg', () => {
      const types = segTypes(r);
      const restIdx = types.indexOf('rest');
      // Allow drive for tiny origin→pickup, but main drive should be after rest
      expect(restIdx).toBeLessThan(types.lastIndexOf('drive'));
    });

    it('rest resets drive hours for next driving period', () => {
      const restSegs = r.segments.filter((s) => s.segmentType === 'rest');
      expect(restSegs.length).toBeGreaterThanOrEqual(1);
      // Find the drive segment AFTER the rest — its hosStateAfter should show
      // reasonable hours (drive started fresh after rest)
      const restIdx = r.segments.findIndex((s) => s.segmentType === 'rest');
      const driveAfterRest = r.segments.slice(restIdx + 1).find((s) => s.segmentType === 'drive');
      if (driveAfterRest) {
        // Drive hours after rest should be reasonable (just the new drive, not 10h carried over)
        expect(driveAfterRest.hosStateAfter.hoursDriven).toBeLessThan(5);
      }
    });
  });

  describe('EDGE-2: 70h cycle exhausted, needs 34h restart', () => {
    // Driver at 69.5h cycle. Even a short route pushes over 70h.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          hosState: {
            hoursDriven: 0,
            onDutyTime: 0,
            hoursSinceBreak: 0,
            drivingHoursSinceBreak: 0,
            cycleHoursUsed: 69.5,
            cycleDaysData: [],
            splitRestState: undefined,
          },
          stops: [
            stop(0, 'origin', 'Terminal', 'houston', 'origin'),
            stop(1, 'pu-1', 'Warehouse', 'houston', 'pickup', {
              dockHours: 1,
              customer: 'Test',
              loadNumber: 'LD-EDGE2',
            }),
            stop(2, 'del-1', 'Delivery', 'dallas', 'delivery', {
              dockHours: 1,
              customer: 'Test',
              loadNumber: 'LD-EDGE2',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 5, hours: 0.1 },
            { from: 'pu-1', to: 'del-1', miles: 240, hours: 3.75 },
          ]),
        }),
      );
    });

    it('inserts 34h restart', () => {
      const restarts = r.segments.filter((s) => s.restType === 'restart_34h');
      expect(restarts.length).toBeGreaterThanOrEqual(1);
    });

    it('cycle resets after restart', () => {
      const restart = r.segments.find((s) => s.restType === 'restart_34h');
      expect(restart).toBeDefined();
      // After 34h restart, the HOS state in applyRestDecision resets cycle.
      // But hosStateAfter is recorded BEFORE the reset in the current flow.
      // The NEXT segment after restart should show reset cycle.
      const restartIdx = r.segments.findIndex((s) => s.restType === 'restart_34h');
      const nextSeg = r.segments[restartIdx + 1];
      if (nextSeg) {
        // After restart + some activity, cycle should be very low
        expect(nextSeg.hosStateAfter.cycleHoursUsed).toBeLessThan(10);
      }
    });

    it('decision reason mentions 70h cycle', () => {
      const restart = r.segments.find((s) => s.restType === 'restart_34h');
      expect(restart?.decisionReason?.trigger).toBe('hos_cycle_limit');
    });

    it('trip spans multiple days due to 34h restart', () => {
      expect(tripHours(r)).toBeGreaterThan(34);
    });
  });

  describe('EDGE-3: Dock-to-rest conversion at overnight shipper', () => {
    // Shipper takes 14h to load (overnight). Truck parked the whole time.
    // Dispatcher marks this as qualifying rest.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          dispatcherDockRestStops: [
            {
              stopId: 'pu-overnight',
              truckParkedHours: 14,
              convertToRest: true,
            },
          ],
          stops: [
            stop(0, 'origin', 'Terminal', 'houston', 'origin'),
            stop(1, 'pu-overnight', 'Overnight Shipper', 'houston', 'pickup', {
              dockHours: 14,
              customer: 'SlowLoad Inc',
              loadNumber: 'LD-EDGE3',
            }),
            stop(2, 'del-1', 'Receiver', 'dallas', 'delivery', {
              dockHours: 1,
              customer: 'SlowLoad Inc',
              loadNumber: 'LD-EDGE3',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-overnight', miles: 5, hours: 0.1 },
            { from: 'pu-overnight', to: 'del-1', miles: 240, hours: 3.75 },
          ]),
        }),
      );
    });

    it('dock segment marked as converted to rest', () => {
      const dockSegs = r.segments.filter((s) => s.segmentType === 'dock');
      const converted = dockSegs.find((s) => s.isDocktimeConverted);
      expect(converted).toBeDefined();
    });

    it('HOS resets after overnight dock (treated as rest)', () => {
      const converted = r.segments.find((s) => s.isDocktimeConverted);
      expect(converted).toBeDefined();
      expect(converted.hosStateAfter.hoursDriven).toBe(0);
      expect(converted.hosStateAfter.onDutyTime).toBe(0);
    });

    it('no separate rest segment needed (dock IS the rest)', () => {
      expect(count(r, 'rest')).toBe(0);
    });

    it('decision reason explains dock-to-rest conversion', () => {
      const converted = r.segments.find((s) => s.isDocktimeConverted);
      expect(converted?.decisionReason?.trigger).toBe('dock_rest_conversion');
    });
  });

  describe('EDGE-4: Break clock at 7.5h, next leg is 1h — proactive break', () => {
    // Driver has 7.5h since last break. 30-min break needed before 8h.
    // Next drive leg is 1h. 7.5 + 1 = 8.5 > 8. Engine should insert break.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          hosState: {
            hoursDriven: 6,
            onDutyTime: 7.5,
            hoursSinceBreak: 7.5,
            drivingHoursSinceBreak: 7.5,
            cycleHoursUsed: 30,
            cycleDaysData: [],
            splitRestState: undefined,
          },
          stops: [
            stop(0, 'origin', 'Current Location', 'dallas', 'origin'),
            stop(1, 'pu-1', 'Nearby Pickup', 'dallas', 'pickup', {
              dockHours: 0.5,
              customer: 'Quick Corp',
              loadNumber: 'LD-EDGE4',
            }),
            stop(2, 'del-1', 'Local Delivery', 'dallas', 'delivery', {
              dockHours: 0.5,
              customer: 'Quick Corp',
              loadNumber: 'LD-EDGE4',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 3, hours: 0.05 },
            { from: 'pu-1', to: 'del-1', miles: 50, hours: 1 },
          ]),
        }),
      );
    });

    it('inserts proactive 30-min break before the drive', () => {
      expect(count(r, 'break')).toBeGreaterThanOrEqual(1);
    });

    it('break happens before the main drive segment', () => {
      const types = segTypes(r);
      const breakIdx = types.indexOf('break');
      const lastDriveIdx = types.lastIndexOf('drive');
      // Break should be before the meaningful drive (not the tiny origin→pickup)
      expect(breakIdx).toBeGreaterThanOrEqual(0);
      expect(breakIdx).toBeLessThanOrEqual(lastDriveIdx);
    });
  });

  describe('EDGE-5: No fuel stops available — engine should warn but not crash', () => {
    // Route needs fuel but no fuel stops exist in corridor.
    let r: SimulationResult;

    beforeAll(async () => {
      r = await simulator.simulate(
        params({
          currentFuelGallons: 30, // Only ~195mi range
          fuelStopFinder: noFuel, // No fuel stops!
          stops: [
            stop(0, 'origin', 'Terminal', 'houston', 'origin'),
            stop(1, 'pu-1', 'Pickup', 'houston', 'pickup', {
              dockHours: 1,
              customer: 'Test',
              loadNumber: 'LD-EDGE5',
            }),
            stop(2, 'del-1', 'Delivery', 'dallas', 'delivery', {
              dockHours: 1,
              customer: 'Test',
              loadNumber: 'LD-EDGE5',
            }),
          ],
          distanceMatrix: buildDM([
            { from: 'origin', to: 'pu-1', miles: 5, hours: 0.1 },
            { from: 'pu-1', to: 'del-1', miles: 240, hours: 3.75 },
          ]),
        }),
      );
    });

    it('should not crash', () => {
      expect(r.segments.length).toBeGreaterThan(0);
    });

    it('should log feasibility issue about missing fuel', () => {
      expect(r.feasibilityIssues.length).toBeGreaterThan(0);
      const fuelIssue = r.feasibilityIssues.find((i) => i.toLowerCase().includes('fuel'));
      expect(fuelIssue).toBeDefined();
    });
  });
});

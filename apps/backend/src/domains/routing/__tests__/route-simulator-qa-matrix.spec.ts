/**
 * QA Matrix Test Runner — 100+ Parameterized Scenarios for RouteSimulator
 *
 * Uses real HOSRuleEngineService with FMCSA values.
 * External dependencies (fuel, weather, routing) use controlled test doubles.
 *
 * Run: npx jest route-simulator-qa-matrix --verbose
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { HOSRuleEngineService } from '../hos-compliance/services/hos-rule-engine.service';
import { RouteSimulator, SimulationResult } from '../route-planning/services/route-simulator';
import {
  SimulationParams,
  ResolvedStop,
  DistanceMatrix,
  FuelStopFinder,
  FuelPricer,
  WeatherChecker,
  RouteGeometryFetcher,
} from '../route-planning/services/route-simulator.interfaces';
import { scenarios, TestScenario } from './scenario-data';

// ─── Real HOS Engine (FMCSA rules) ──────────────────────────────────────────

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

// ─── Weather Test Doubles ────────────────────────────────────────────────────

const weatherDoubles: Record<TestScenario['weather'], WeatherChecker> = {
  clear: { check: async () => [] },
  rain: {
    check: async () => [
      {
        lat: 33.0,
        lon: -90.0,
        condition: 'rain',
        severity: 'low' as const,
        description: 'Rain along route',
        temperatureF: 55,
        windSpeedMph: 15,
        driveTimeMultiplier: 1.1,
      },
    ],
  },
  snow: {
    check: async () => [
      {
        lat: 35.0,
        lon: -90.0,
        condition: 'snow',
        severity: 'moderate' as const,
        description: 'Snow along route',
        temperatureF: 28,
        windSpeedMph: 20,
        driveTimeMultiplier: 1.3,
      },
    ],
  },
  ice: {
    check: async () => [
      {
        lat: 35.0,
        lon: -90.0,
        condition: 'ice',
        severity: 'severe' as const,
        description: 'Ice along route',
        temperatureF: 22,
        windSpeedMph: 10,
        driveTimeMultiplier: 1.5,
      },
    ],
  },
  thunderstorm: {
    check: async () => [
      {
        lat: 33.0,
        lon: -92.0,
        condition: 'thunderstorm',
        severity: 'moderate' as const,
        description: 'Thunderstorm along route',
        temperatureF: 68,
        windSpeedMph: 40,
        driveTimeMultiplier: 1.2,
      },
    ],
  },
};

// ─── Fuel Test Doubles ───────────────────────────────────────────────────────

function makeFuelFinder(availability: TestScenario['fuelStopAvailability']): FuelStopFinder {
  const stops: Record<
    string,
    Array<{
      stopId: string;
      name: string;
      lat: number;
      lon: number;
      city: string;
      state: string;
      fuelPricePerGallon: number;
      brand: string;
      amenities: string[];
      distanceFromRoute: number;
    }>
  > = {
    multiple: [
      {
        stopId: 'fs-1',
        name: 'Loves Travel Stop',
        lat: 33.0,
        lon: -92.0,
        city: 'Texarkana',
        state: 'TX',
        fuelPricePerGallon: 3.35,
        brand: 'Loves',
        amenities: ['fuel', 'parking', 'showers'],
        distanceFromRoute: 2,
      },
      {
        stopId: 'fs-2',
        name: 'Pilot Flying J',
        lat: 34.0,
        lon: -91.0,
        city: 'Pine Bluff',
        state: 'AR',
        fuelPricePerGallon: 3.55,
        brand: 'Pilot',
        amenities: ['fuel', 'parking'],
        distanceFromRoute: 3,
      },
      {
        stopId: 'fs-3',
        name: 'TA Petro',
        lat: 35.0,
        lon: -90.0,
        city: 'West Memphis',
        state: 'AR',
        fuelPricePerGallon: 3.72,
        brand: 'TA',
        amenities: ['fuel', 'parking', 'showers'],
        distanceFromRoute: 1,
      },
    ],
    single: [
      {
        stopId: 'fs-solo',
        name: 'Independent Truck Stop',
        lat: 33.5,
        lon: -91.0,
        city: 'Midway',
        state: 'AR',
        fuelPricePerGallon: 3.89,
        brand: 'Independent',
        amenities: ['fuel', 'parking'],
        distanceFromRoute: 5,
      },
    ],
    none: [],
  };

  const stopsForAvailability = stops[availability];

  return {
    findAlongCorridor: async () => stopsForAvailability,
    findTruckStopsNear: async () => stopsForAvailability,
  };
}

const defaultPricer: FuelPricer = {
  getPriceForStop: async (stop) => ({
    pricePerGallon: stop.fuelPricePerGallon || 3.89,
  }),
};

const noGeometry: RouteGeometryFetcher = { getGeometry: async () => null };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFromScenario(s: TestScenario): SimulationParams {
  // Build stops: origin, pickup, delivery
  const stops: ResolvedStop[] = [
    {
      id: 0,
      stopId: 'origin',
      name: s.origin.name,
      lat: s.origin.lat,
      lon: s.origin.lon,
      type: 'origin',
    },
    {
      id: 1,
      stopId: 'pu-1',
      name: s.pickup.name,
      lat: s.pickup.lat,
      lon: s.pickup.lon,
      type: 'pickup',
      dockDurationHours: s.pickup.dockHours,
      customerName: 'Test Customer',
      loadNumber: 'LD-QA',
    },
    {
      id: 2,
      stopId: 'del-1',
      name: s.delivery.name,
      lat: s.delivery.lat,
      lon: s.delivery.lon,
      type: 'delivery',
      dockDurationHours: s.delivery.dockHours,
      customerName: 'Test Customer',
      loadNumber: 'LD-QA',
    },
  ];

  // Build distance matrix
  // Origin to pickup: assume 5mi/0.15h if same city, otherwise use haversine approximation
  const sameCity = Math.abs(s.origin.lat - s.pickup.lat) < 0.05 && Math.abs(s.origin.lon - s.pickup.lon) < 0.05;
  const originToPickupMiles = sameCity ? 5 : s.distanceMiles * 0.1;
  const originToPickupHours = sameCity ? 0.15 : s.driveTimeHours * 0.1;

  const dm: DistanceMatrix = new Map();
  dm.set('origin:pu-1', {
    distanceMiles: originToPickupMiles,
    driveTimeHours: originToPickupHours,
  });
  dm.set('pu-1:del-1', {
    distanceMiles: s.distanceMiles,
    driveTimeHours: s.driveTimeHours,
  });

  // Build dock rest stops array if configured
  const dispatcherDockRestStops = s.dockRestConversion ? [s.dockRestConversion] : undefined;

  return {
    stops,
    distanceMatrix: dm,
    departureTime: new Date('2026-04-03T06:00:00-05:00'),
    hosState: {
      hoursDriven: s.driver.hoursDriven,
      onDutyTime: s.driver.onDutyTime,
      hoursSinceBreak: s.driver.hoursSinceBreak,
      drivingHoursSinceBreak: s.driver.hoursSinceBreak,
      cycleHoursUsed: s.driver.cycleHoursUsed,
      cycleDaysData: [],
      splitRestState: undefined,
    },
    fuelCapacityGallons: s.vehicle.fuelCapacityGallons,
    mpg: s.vehicle.mpg,
    currentFuelGallons: s.vehicle.currentFuelGallons,
    hasSleeperBerth: s.vehicle.hasSleeperBerth,
    acceptedBrands: [],
    maxDetourMiles: 15,
    preferredRest: s.preferredRest,
    allowDockRest: s.allowDockRest,
    costPerMile: 1.85,
    laborCostPerHour: 25,
    splitSleeperThresholdHours: 16,
    dispatcherDockRestStops,
    fuelStopFinder: makeFuelFinder(s.fuelStopAvailability),
    fuelPricer: defaultPricer,
    weatherChecker: weatherDoubles[s.weather],
    routeGeometryFetcher: noGeometry,
  };
}

function count(r: SimulationResult, type: string): number {
  return r.segments.filter((seg) => seg.segmentType === type).length;
}

function tripHours(r: SimulationResult): number {
  if (r.segments.length === 0) return 0;
  const first = r.segments[0].estimatedDeparture.getTime();
  const last = r.segments[r.segments.length - 1].estimatedArrival.getTime();
  return (last - first) / 3600000;
}

// ─── CSV Results Accumulator ─────────────────────────────────────────────────

interface ScenarioResult {
  scenario: TestScenario;
  driveCount: number;
  restCount: number;
  fuelCount: number;
  breakCount: number;
  hasRestart: boolean;
  dockConversions: number;
  trip: number;
  feasible: boolean;
  status: 'PASS' | 'FAIL';
}

const results: ScenarioResult[] = [];

// ─── TEST SUITE ──────────────────────────────────────────────────────────────

describe('QA Matrix — 100+ Route Simulator Scenarios', () => {
  // Increase timeout for all tests — some scenarios involve multiple rest periods
  jest.setTimeout(30000);

  describe.each(scenarios)('$id: $name', (s: TestScenario) => {
    let result: SimulationResult;

    beforeAll(async () => {
      result = await simulator.simulate(buildFromScenario(s));
    });

    it('produces expected segment counts and trip duration', () => {
      const driveCount = count(result, 'drive');
      const restCount = count(result, 'rest');
      const fuelCount = count(result, 'fuel');
      const breakCount = count(result, 'break');
      const hasRestart = result.segments.some((seg) => seg.restType === 'restart_34h');
      const dockConversions = result.segments.filter((seg) => seg.isDocktimeConverted).length;
      const trip = tripHours(result);

      // Record result for CSV
      let status: 'PASS' | 'FAIL' = 'PASS';

      try {
        // Drive segments
        expect(driveCount).toBeGreaterThanOrEqual(s.expected.minDriveSegments);

        // Rest stops
        expect(restCount).toBeGreaterThanOrEqual(s.expected.minRestStops);
        expect(restCount).toBeLessThanOrEqual(s.expected.maxRestStops);

        // Fuel stops
        expect(fuelCount).toBeGreaterThanOrEqual(s.expected.minFuelStops);

        // Breaks
        expect(breakCount).toBeGreaterThanOrEqual(s.expected.minBreaks);

        // 34h restart
        expect(hasRestart).toBe(s.expected.needsRestart);

        // Dock rest conversions
        expect(dockConversions).toBe(s.expected.dockRestConversions);

        // Trip duration bounds
        expect(trip).toBeGreaterThanOrEqual(s.expected.minTripHours);
        expect(trip).toBeLessThanOrEqual(s.expected.maxTripHours);

        // HOS compliance: no drive segment should exceed 11h
        for (const seg of result.segments) {
          if (seg.segmentType === 'drive') {
            expect(seg.driveTimeHours).toBeLessThanOrEqual(11.1);
          }
        }

        // Feasibility
        if (s.expected.feasible) {
          // Allow fuel feasibility issues (no fuel stops found) but not structural ones
          const structuralIssues = result.feasibilityIssues.filter((issue) => !issue.includes('No fuel stops found'));
          expect(structuralIssues).toHaveLength(0);
        }
      } catch (e) {
        status = 'FAIL';
        throw e;
      } finally {
        results.push({
          scenario: s,
          driveCount,
          restCount,
          fuelCount,
          breakCount,
          hasRestart,
          dockConversions,
          trip,
          feasible: result.feasibilityIssues.filter((i) => !i.includes('No fuel stops found')).length === 0,
          status,
        });

        // Log summary line
        console.log(
          `${s.id} | ${s.category.padEnd(13)} | ${s.name.substring(0, 45).padEnd(45)} | D:${driveCount} R:${restCount} F:${fuelCount} B:${breakCount} | ${trip.toFixed(1)}h | ${status}`,
        );
      }
    });
  });

  afterAll(() => {
    // Write CSV results
    const csvDir = path.resolve(__dirname, '../../../../../../.docs/plans/route-planning-v3');
    const csvPath = path.join(csvDir, 'qa-matrix-results.csv');

    // Ensure directory exists
    try {
      fs.mkdirSync(csvDir, { recursive: true });
    } catch {
      // ignore if exists
    }

    const header =
      'Scenario ID,Category,Route,Distance (mi),Drive Time (h),Driver HOS,Vehicle,Rest Pref,Weather,Expected Rest Stops,Expected Fuel Stops,Expected Breaks,Needs Restart,Actual Rest Stops,Actual Fuel Stops,Actual Breaks,Got Restart,Trip Hours,Feasible,Status,Notes';

    const rows = results.map((r) => {
      const s = r.scenario;
      const route = `${s.origin.city}-${s.delivery.city}`;
      const driverHOS = `${s.driver.hoursDriven}h/${s.driver.onDutyTime}h/${s.driver.cycleHoursUsed}h`;
      const vehicle = `${s.vehicle.currentFuelGallons}/${s.vehicle.fuelCapacityGallons}gal ${s.vehicle.mpg}mpg${s.vehicle.hasSleeperBerth ? ' SB' : ''}`;

      return [
        s.id,
        s.category,
        route,
        s.distanceMiles,
        s.driveTimeHours,
        driverHOS,
        vehicle,
        s.preferredRest,
        s.weather,
        `${s.expected.minRestStops}-${s.expected.maxRestStops}`,
        s.expected.minFuelStops,
        s.expected.minBreaks,
        s.expected.needsRestart,
        r.restCount,
        r.fuelCount,
        r.breakCount,
        r.hasRestart,
        r.trip.toFixed(1),
        r.feasible,
        r.status,
        `"${(s.expected.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    try {
      fs.writeFileSync(csvPath, csv, 'utf-8');
      console.log(`\nCSV results written to: ${csvPath}`);
    } catch (err) {
      console.warn(`Could not write CSV: ${err}`);
    }

    // Print summary
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\n===== QA MATRIX SUMMARY =====\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);
  });
});

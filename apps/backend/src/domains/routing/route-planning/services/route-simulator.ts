import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  EARTH_RADIUS_MILES,
  FUEL_RESERVE_GALLONS,
  FUELING_TIME_HOURS,
  BREAK_DURATION_HOURS,
  DOCK_DEFAULT_HOURS,
  MAX_SIMULATION_SEGMENTS,
  HOS_CONSTANTS,
  StopEntryPolicy,
} from '@sally/shared-types';

/** Facility entry policies — single source from the generated Prisma enum mirror. */
const STOP_ENTRY_POLICY = StopEntryPolicy;
import { WeatherAlert } from '../../providers/weather/weather-provider.interface';
import { HOSRuleEngineService, HOSState } from '../../hos-compliance/services/hos-rule-engine.service';
import { SimulationParams, ResolvedStop, DistanceMatrix } from './route-simulator.interfaces';

// ─── Exported Types ─────────────────────────────────────────────────────────

export interface SegmentResult {
  segmentId: string;
  sequenceOrder: number;
  segmentType: 'drive' | 'rest' | 'fuel' | 'dock' | 'break' | 'wait';
  fromLocation: string;
  toLocation: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distanceMiles?: number;
  driveTimeHours?: number;
  restDurationHours?: number;
  restType?: string;
  restReason?: string;
  dockDurationHours?: number;
  customerName?: string;
  fuelGallons?: number;
  fuelCostEstimate?: number;
  fuelStationName?: string;
  fuelPricePerGallon?: number;
  detourMiles?: number;
  isDocktimeConverted?: boolean;
  actionType?: string;
  estimatedArrival: Date;
  estimatedDeparture: Date;
  hosStateAfter: HOSState;
  weatherAlerts?: WeatherAlert[];
  routeGeometry?: string;
  timezone?: string;
  appointmentWindow?: { start: Date; end: Date };
  /** Negative = minutes late past window close; positive = minutes of slack. Dock only. */
  arrivalBufferMinutes?: number;
  decisionReason?: {
    summary: string;
    details: string;
    alternativesCount?: number;
    trigger: string;
    hosStateAtDecision?: {
      hoursDriven: number;
      onDutyTime: number;
      hoursSinceBreak: number;
      cycleHoursUsed: number;
    };
  };
}

export type ComplianceRuleStatus = 'pass' | 'addressed' | 'violation';

export interface ComplianceReport {
  isFullyCompliant: boolean;
  totalRestStops: number;
  totalBreaks: number;
  total34hRestarts: number;
  totalSplitRests: number;
  dockTimeConversions: number;
  rules: Array<{ rule: string; status: ComplianceRuleStatus; detail?: string }>;
}

export interface DayBreakdown {
  day: number;
  date: string;
  driveHours: number;
  onDutyHours: number;
  segments: number;
  restStops: number;
}

export interface CostBreakdown {
  fuelCost: number;
  laborCost: number;
  tollCost: number;
  /** Provenance of tollCost: 'LIVE' when a toll feed answered, 'NOT_AVAILABLE' when none is connected (tollCost is 0 but NOT a real "free" — UI must label it). */
  tollSource: 'LIVE' | 'ESTIMATED' | 'NOT_AVAILABLE';
  tollNote?: string;
  totalOperatingCost: number;
  costPerMile: number;
  laborCostPerHour: number;
}

export type RestDecision =
  | { type: 'none' }
  | { type: 'break_30min' }
  | { type: 'full_rest'; hours: number }
  | { type: 'split_first'; splitType: '7_3' | '8_2'; hours: number }
  | { type: 'split_second'; splitType: '7_3' | '8_2'; hours: number }
  | { type: 'restart_34h' };

export interface SimulationState {
  currentTime: Date;
  hosState: HOSState;
  fuelRemainingGallons: number;
  currentLat: number;
  currentLon: number;
  currentLocation: string;
  segments: SegmentResult[];
  segmentCounter: number;
  dayCounter: number;
  dailyBreakdown: DayBreakdown[];
  weatherAlerts: WeatherAlert[];
  feasibilityIssues: string[];
  totalDistanceMiles: number;
  totalDriveTimeHours: number;
  totalCostEstimate: number;
  fuelCapacityGallons: number;
  mpg: number;
  acceptedBrands: string[];
}

export interface SimulationResult {
  segments: SegmentResult[];
  totalDistanceMiles: number;
  totalDriveTimeHours: number;
  totalCostEstimate: number;
  dayCounter: number;
  dailyBreakdown: DayBreakdown[];
  weatherAlerts: WeatherAlert[];
  feasibilityIssues: string[];
  complianceReport: ComplianceReport;
  costBreakdown: CostBreakdown;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class RouteSimulator {
  private readonly logger = new Logger(RouteSimulator.name);

  constructor(
    private readonly hosEngine: HOSRuleEngineService,
    private readonly minRestHours: number,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  async simulate(params: SimulationParams): Promise<SimulationResult> {
    const optimizedStops = this.optimizeStopSequence(params.stops, params.distanceMatrix);

    const state = await this.simulateRoute(optimizedStops, params);

    const complianceReport = this.buildComplianceReport(state);
    const costBreakdown = this.buildCostBreakdown(state, params);

    return {
      segments: state.segments,
      totalDistanceMiles: state.totalDistanceMiles,
      totalDriveTimeHours: state.totalDriveTimeHours,
      totalCostEstimate: state.totalCostEstimate,
      dayCounter: state.dayCounter,
      dailyBreakdown: state.dailyBreakdown,
      weatherAlerts: state.weatherAlerts,
      feasibilityIssues: state.feasibilityIssues,
      complianceReport,
      costBreakdown,
    };
  }

  // ─── TSP Optimization ─────────────────────────────────────────────────────

  optimizeStopSequence(stops: ResolvedStop[], distanceMatrix: DistanceMatrix): ResolvedStop[] {
    if (stops.length <= 3) {
      return this.ensurePickupBeforeDelivery(stops);
    }

    const origin = stops[0];
    const remaining = [...stops.slice(1)];
    const ordered: ResolvedStop[] = [origin];
    let current = origin;

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        if (
          candidate.type === 'delivery' &&
          candidate.loadNumber &&
          !this.isPickupVisited(candidate.loadNumber, ordered, remaining)
        ) {
          continue;
        }

        const key = this.matrixKey(current.stopId, candidate.stopId);
        const entry = distanceMatrix.get(key);
        const dist = entry?.distanceMiles ?? Infinity;

        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next);
      current = next;
    }

    return this.twoOptImprove(ordered, distanceMatrix);
  }

  twoOptImprove(stops: ResolvedStop[], distanceMatrix: DistanceMatrix): ResolvedStop[] {
    if (stops.length <= 3) return stops;

    const route = [...stops];
    const MAX_ITERATIONS = 100;
    let improved = true;
    let iterations = 0;

    while (improved && iterations < MAX_ITERATIONS) {
      improved = false;
      iterations++;

      for (let i = 1; i < route.length - 2; i++) {
        for (let j = i + 1; j < route.length - 1; j++) {
          const d1 =
            this.getMatrixDistance(route[i - 1], route[i], distanceMatrix) +
            this.getMatrixDistance(route[j], route[j + 1], distanceMatrix);
          const d2 =
            this.getMatrixDistance(route[i - 1], route[j], distanceMatrix) +
            this.getMatrixDistance(route[i], route[j + 1], distanceMatrix);

          if (d2 < d1) {
            const candidate = [...route];
            const reversed = candidate.slice(i, j + 1).reverse();
            candidate.splice(i, reversed.length, ...reversed);

            if (this.isPickupDeliveryOrderValid(candidate)) {
              route.splice(i, reversed.length, ...reversed);
              improved = true;
            }
          }
        }
      }
    }

    return route;
  }

  getMatrixDistance(a: ResolvedStop, b: ResolvedStop, distanceMatrix: DistanceMatrix): number {
    const key = this.matrixKey(a.stopId, b.stopId);
    const entry = distanceMatrix.get(key);
    if (entry?.distanceMiles != null) return entry.distanceMiles;
    return this.haversineDistance(a, b);
  }

  isPickupDeliveryOrderValid(stops: ResolvedStop[]): boolean {
    const visitedPickups = new Set<string>();

    for (const stop of stops) {
      if (stop.type === 'pickup' && stop.loadNumber) {
        visitedPickups.add(stop.loadNumber);
      } else if (stop.type === 'delivery' && stop.loadNumber) {
        if (!visitedPickups.has(stop.loadNumber)) {
          return false;
        }
      }
    }
    return true;
  }

  isPickupVisited(loadId: string, visited: ResolvedStop[], remaining: ResolvedStop[]): boolean {
    const hasUnvisitedPickup = remaining.some((s) => s.type === 'pickup' && s.loadNumber === loadId);
    if (!hasUnvisitedPickup) return true;
    return visited.some((s) => s.type === 'pickup' && s.loadNumber === loadId);
  }

  ensurePickupBeforeDelivery(stops: ResolvedStop[]): ResolvedStop[] {
    const result = [stops[0]];
    const remaining = stops.slice(1);

    const pickups = remaining.filter((s) => s.type === 'pickup');
    const deliveries = remaining.filter((s) => s.type === 'delivery');
    const others = remaining.filter((s) => s.type !== 'pickup' && s.type !== 'delivery');

    result.push(...pickups, ...deliveries, ...others);
    return result;
  }

  // ─── Route Simulation ─────────────────────────────────────────────────────

  async simulateRoute(stops: ResolvedStop[], params: SimulationParams): Promise<SimulationState> {
    const state: SimulationState = {
      currentTime: new Date(params.departureTime),
      hosState: params.hosState,
      fuelRemainingGallons: params.currentFuelGallons,
      currentLat: stops[0].lat,
      currentLon: stops[0].lon,
      currentLocation: stops[0].name,
      segments: [],
      segmentCounter: 0,
      dayCounter: 1,
      dailyBreakdown: [this.newDayBreakdown(1, params.departureTime)],
      weatherAlerts: [],
      feasibilityIssues: [],
      totalDistanceMiles: 0,
      totalDriveTimeHours: 0,
      totalCostEstimate: 0,
      fuelCapacityGallons: params.fuelCapacityGallons,
      mpg: params.mpg,
      acceptedBrands: params.acceptedBrands,
    };

    const dockRestMap = this.buildDockRestMap(params.dispatcherDockRestStops);

    for (let i = 0; i < stops.length - 1; i++) {
      if (state.segments.length >= MAX_SIMULATION_SEGMENTS) {
        state.feasibilityIssues.push('Route exceeded maximum segment limit');
        break;
      }

      const from = stops[i];
      const to = stops[i + 1];

      const key = this.matrixKey(from.stopId, to.stopId);
      const matrixEntry = params.distanceMatrix.get(key);
      const legDistanceMiles = matrixEntry?.distanceMiles ?? this.haversineDistance(from, to);
      const legDriveTimeHours = matrixEntry?.driveTimeHours ?? legDistanceMiles / 55;

      if (legDistanceMiles < 0.1) {
        state.currentLat = to.lat;
        state.currentLon = to.lon;
        state.currentLocation = to.name;
      } else {
        const legWeather = await this.checkWeatherForLeg(from, to, state.currentTime, params);
        state.weatherAlerts.push(...legWeather);
        const weatherMultiplier = this.getMaxWeatherMultiplier(legWeather);
        const adjustedDriveTime = legDriveTimeHours * weatherMultiplier;

        const fuelNeeded = legDistanceMiles / state.mpg;
        const needsFuel = state.fuelRemainingGallons - fuelNeeded < FUEL_RESERVE_GALLONS;
        const hoursAvailable = this.hosEngine.hoursUntilRestRequired(state.hosState);
        const needsRest = hoursAvailable < adjustedDriveTime;

        if (needsFuel && needsRest) {
          const combined = await this.insertCombinedFuelRestStop(state, from, to, params, stops, i, adjustedDriveTime);
          if (!combined) {
            await this.insertFuelStop(state, from, to, params);
            const restDecision = this.decideRest(state, adjustedDriveTime, params, stops, i);
            await this.applyRestDecision(state, restDecision);
          }
        } else {
          if (needsFuel) {
            await this.insertFuelStop(state, from, to, params);
          }
          if (needsRest) {
            const restDecision = this.decideRest(state, adjustedDriveTime, params, stops, i);
            await this.applyRestDecision(state, restDecision);
          }
        }

        // FMCSA §395.3(a)(3)(ii): 30-min break after 8 cumulative hours of driving.
        // Pre-schedule at (trigger − safety buffer) so real-world drift doesn't violate.
        if (
          state.hosState.drivingHoursSinceBreak >=
            HOS_CONSTANTS.BREAK_TRIGGER_HOURS - HOS_CONSTANTS.BREAK_SAFETY_BUFFER_HOURS &&
          adjustedDriveTime > 0.5
        ) {
          this.insertBreak(state);
        }

        // ─── Drive with HOS-splitting ─────────────────────────────
        // If the leg exceeds available HOS hours, split it into
        // multiple drive segments with rest/break inserted mid-route.
        await this.driveWithHOSSplitting(
          state,
          from,
          to,
          legDistanceMiles,
          adjustedDriveTime,
          legWeather,
          params,
          stops,
          i,
        );
      }

      if (to.type === 'pickup' || to.type === 'delivery') {
        const scheduledDockHours = to.dockDurationHours ?? DOCK_DEFAULT_HOURS;
        // Realistic dwell: add this customer's median (p50) detention so the NEXT
        // stop's ETA isn't optimistic. The segment surfaces both numbers.
        const detentionHours = (to.detentionP50Minutes ?? 0) / 60;
        const dockHours = scheduledDockHours + detentionHours;
        const dockRestConfig = dockRestMap.get(to.stopId);

        // Honor the appointment window before docking: wait off-duty if early,
        // flag a feasibility issue if late. Returns minutes of slack (+) or
        // minutes late (−) at the moment the dock begins.
        const arrivalBufferMinutes = this.applyAppointmentWindow(state, to);

        if (
          params.allowDockRest &&
          dockRestConfig?.convertToRest &&
          dockRestConfig.truckParkedHours >= this.minRestHours
        ) {
          state.hosState = this.hosEngine.simulateAfterFullRest(state.hosState);
          this.addDockSegment(state, to, dockHours, true, arrivalBufferMinutes, scheduledDockHours, detentionHours);
        } else {
          state.hosState = this.hosEngine.simulateAfterDriving(state.hosState, 0, dockHours);
          this.addDockSegment(state, to, dockHours, false, arrivalBufferMinutes, scheduledDockHours, detentionHours);
        }
      }
    }

    return state;
  }

  // ─── Rest Decision Logic ──────────────────────────────────────────────────

  decideRest(
    state: SimulationState,
    neededDriveHours: number,
    params: SimulationParams,
    stops: ResolvedStop[],
    currentStopIdx: number,
  ): RestDecision {
    const compliance = this.hosEngine.validateCompliance(state.hosState);

    if (compliance.needsRestart) {
      return { type: 'restart_34h' };
    }

    if (compliance.hoursAvailableToDrive >= neededDriveHours && compliance.hoursUntilBreakRequired < neededDriveHours) {
      return { type: 'break_30min' };
    }

    if (params.preferredRest === 'full' || !params.hasSleeperBerth) {
      return { type: 'full_rest', hours: this.minRestHours };
    }

    if (params.preferredRest === 'split_8_2') {
      if (state.hosState.splitRestState?.firstPortionCompleted) {
        return { type: 'split_second', splitType: '8_2', hours: 2 };
      }
      return { type: 'split_first', splitType: '8_2', hours: 8 };
    }

    if (params.preferredRest === 'split_7_3') {
      if (state.hosState.splitRestState?.firstPortionCompleted) {
        return { type: 'split_second', splitType: '7_3', hours: 3 };
      }
      return { type: 'split_first', splitType: '7_3', hours: 7 };
    }

    return this.lookAheadRestDecision(state, neededDriveHours, params, stops, currentStopIdx);
  }

  lookAheadRestDecision(
    state: SimulationState,
    neededDriveHours: number,
    params: SimulationParams,
    stops: ResolvedStop[],
    currentStopIdx: number,
  ): RestDecision {
    let remainingDriveHours = neededDriveHours;
    for (let i = currentStopIdx + 1; i < stops.length - 1; i++) {
      const key = this.matrixKey(stops[i].stopId, stops[i + 1].stopId);
      const entry = params.distanceMatrix.get(key);
      remainingDriveHours += entry?.driveTimeHours ?? 2;
    }

    if (state.hosState.splitRestState?.firstPortionCompleted) {
      const splitType = state.hosState.splitRestState.firstPortionType;
      if (splitType === 'sleeper_7') {
        return { type: 'split_second', splitType: '7_3', hours: 3 };
      }
      if (splitType === 'sleeper_8') {
        return { type: 'split_second', splitType: '8_2', hours: 2 };
      }
    }

    const splitThreshold = params.splitSleeperThresholdHours ?? 16;
    if (remainingDriveHours <= splitThreshold || !params.hasSleeperBerth) {
      return { type: 'full_rest', hours: this.minRestHours };
    }

    return { type: 'split_first', splitType: '8_2', hours: 8 };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for future awaited updates
  async applyRestDecision(state: SimulationState, decision: RestDecision): Promise<void> {
    const hosSnapshot = {
      hoursDriven: state.hosState.hoursDriven,
      onDutyTime: state.hosState.onDutyTime,
      hoursSinceBreak: state.hosState.hoursSinceBreak,
      cycleHoursUsed: state.hosState.cycleHoursUsed,
    };

    switch (decision.type) {
      case 'none':
        break;

      case 'break_30min':
        this.insertBreak(state);
        break;

      case 'full_rest':
        this.addRestSegment(state, 'full_rest', decision.hours, 'HOS daily limit reached', {
          summary: `Take a full ${decision.hours}h rest now — ${hosSnapshot.hoursDriven.toFixed(1)}h driven, ${hosSnapshot.onDutyTime.toFixed(1)}h on duty`,
          details:
            `Recommend a full ${decision.hours}h reset rather than pushing on: ${hosSnapshot.hoursDriven.toFixed(1)}h of the 11h drive limit and ` +
            `${hosSnapshot.onDutyTime.toFixed(1)}h of the 14h duty window are used. With the remaining run short enough to finish on a fresh ` +
            `clock, one full reset is more efficient than a split (a split would only pay off across a longer multi-day haul). A full rest ` +
            `resets the drive, duty, and break clocks; the 70h cycle (${hosSnapshot.cycleHoursUsed.toFixed(1)}h used) carries over.`,
          trigger: 'hos_daily_limit',
          hosStateAtDecision: hosSnapshot,
        });
        state.hosState = this.hosEngine.simulateAfterFullRest(state.hosState);
        this.advanceDay(state, decision.hours);
        break;

      case 'split_first':
        this.addRestSegment(
          state,
          `split_${decision.splitType}_first`,
          decision.hours,
          `Split sleeper berth (${decision.splitType}) - first portion`,
          {
            summary: `Split your rest ${decision.splitType} (take ${decision.hours}h in the berth now) — keeps you driving longer today`,
            details:
              `Recommend splitting the sleeper berth (${decision.splitType}) instead of a single 10h reset because a long run remains: the ` +
              `qualifying ${decision.hours}h sleeper portion PAUSES the 14h duty window (FMCSA §395.1(g)), so the hours spent resting don't ` +
              `burn the clock — you reach the destination in fewer elapsed days than a full reset would allow. ` +
              `${hosSnapshot.cycleHoursUsed.toFixed(1)}h of the 70h cycle is used. Pair this with the matching ${decision.splitType === '8_2' ? '2h' : '3h'} portion later to complete the split.`,
            trigger: 'hos_split_sleeper',
            hosStateAtDecision: hosSnapshot,
          },
        );
        state.hosState = this.hosEngine.simulateAfterSplitRest(state.hosState, decision.splitType, 'first');
        if (decision.hours >= 7) {
          this.advanceDay(state, decision.hours);
        }
        break;

      case 'split_second':
        this.addRestSegment(
          state,
          `split_${decision.splitType}_second`,
          decision.hours,
          `Split sleeper berth (${decision.splitType}) - second portion`,
          {
            summary: `Split rest ${decision.splitType} second portion (${decision.hours}h): completing split cycle`,
            details: `Completing split sleeper berth rest. Second ${decision.hours}h portion completes the required off-duty time. ${hosSnapshot.hoursDriven.toFixed(1)}h driven since split began.`,
            trigger: 'hos_split_sleeper_completion',
            hosStateAtDecision: hosSnapshot,
          },
        );
        state.hosState = this.hosEngine.simulateAfterSplitRest(state.hosState, decision.splitType, 'second');
        break;

      case 'restart_34h':
        this.addRestSegment(state, 'restart_34h', 34, '70-hour cycle limit reached', {
          summary: `34h restart required: ${hosSnapshot.cycleHoursUsed.toFixed(1)}h of 70h cycle used`,
          details: `70-hour/8-day cycle limit reached (${hosSnapshot.cycleHoursUsed.toFixed(1)}h used). A 34-hour restart resets the entire cycle clock to zero.`,
          trigger: 'hos_cycle_limit',
          hosStateAtDecision: hosSnapshot,
        });
        state.hosState = this.hosEngine.simulateAfter34hRestart(state.hosState);
        this.advanceDay(state, 34);
        break;
    }
  }

  // ─── Segment Builders ─────────────────────────────────────────────────────

  /**
   * Drive a leg, splitting into multiple drive segments when HOS limits
   * are reached mid-route. Inserts rest, breaks, and fuel stops between
   * sub-segments as needed.
   *
   * This is the core improvement over the naive "drive the whole leg" approach.
   * For a 1050mi/17h leg, this will produce multiple drive segments like:
   *   drive 8h → break → drive 3h → rest 10h → drive 6h
   *
   * Intermediate positions are interpolated linearly between from/to
   * since we don't have intermediate waypoints from the distance matrix.
   */
  async driveWithHOSSplitting(
    state: SimulationState,
    from: ResolvedStop,
    to: ResolvedStop,
    totalMiles: number,
    totalHours: number,
    weather: WeatherAlert[],
    params: SimulationParams,
    stops: ResolvedStop[],
    stopIdx: number,
  ): Promise<void> {
    let remainingMiles = totalMiles;
    let remainingHours = totalHours;
    const speedMph = totalMiles / totalHours; // average speed for this leg
    const geometry = await this.getRouteGeometry(from, to, params);
    let subSegCount = 0;
    const MAX_SUB_SEGMENTS = 20; // safety valve

    while (remainingHours > 0.01 && subSegCount < MAX_SUB_SEGMENTS) {
      subSegCount++;

      // FMCSA §395.3(a)(3)(ii): 30-min break after 8 cumulative hours of driving.
      // Pre-schedule at (trigger − safety buffer) so real-world drift doesn't violate.
      if (
        state.hosState.drivingHoursSinceBreak >=
          HOS_CONSTANTS.BREAK_TRIGGER_HOURS - HOS_CONSTANTS.BREAK_SAFETY_BUFFER_HOURS &&
        remainingHours > 0.5
      ) {
        this.insertBreak(state);
      }

      // Recheck after break (break may have shifted hours)
      const hoursAfterBreak = this.hosEngine.hoursUntilRestRequired(state.hosState);

      // Check fuel mid-leg
      const fuelForRemaining = remainingMiles / state.mpg;
      if (state.fuelRemainingGallons - fuelForRemaining < FUEL_RESERVE_GALLONS) {
        // Need fuel — insert fuel stop at current interpolated position
        const progress = 1 - remainingMiles / totalMiles;
        const midStop: ResolvedStop = {
          id: -1,
          stopId: `mid-${from.stopId}-${to.stopId}`,
          name: `En route to ${to.name}`,
          lat: from.lat + (to.lat - from.lat) * progress,
          lon: from.lon + (to.lon - from.lon) * progress,
          type: 'fuel',
        };
        await this.insertFuelStop(state, midStop, to, params);
      }

      if (hoursAfterBreak >= remainingHours) {
        // Can drive the rest of the leg without another rest
        // Interpolate "from" position based on how far we've already driven
        const progress = 1 - remainingMiles / totalMiles;
        const currentFrom: ResolvedStop =
          progress > 0.01
            ? {
                id: from.id,
                stopId: from.stopId,
                name: state.currentLocation,
                lat: from.lat + (to.lat - from.lat) * progress,
                lon: from.lon + (to.lon - from.lon) * progress,
                type: 'origin',
                timezone: from.timezone,
              }
            : from;

        this.addDriveSegment(
          state,
          currentFrom,
          to,
          remainingMiles,
          remainingHours,
          subSegCount === 1 ? weather : [], // weather only on first sub-segment
          subSegCount === 1 ? (geometry ?? undefined) : undefined,
        );
        remainingMiles = 0;
        remainingHours = 0;
      } else {
        // Can only drive part of the leg — drive as far as HOS allows
        const drivableHours = Math.max(0.5, hoursAfterBreak - 0.1); // small buffer
        const drivableMiles = drivableHours * speedMph;

        const progress = 1 - remainingMiles / totalMiles;
        const currentFrom: ResolvedStop =
          progress > 0.01
            ? {
                id: from.id,
                stopId: from.stopId,
                name: state.currentLocation,
                lat: from.lat + (to.lat - from.lat) * progress,
                lon: from.lon + (to.lon - from.lon) * progress,
                type: 'origin',
                timezone: from.timezone,
              }
            : from;

        const nextProgress = (totalMiles - remainingMiles + drivableMiles) / totalMiles;
        const intermediateStop: ResolvedStop = {
          id: -1,
          stopId: `intermediate-${subSegCount}`,
          name: `En route to ${to.name}`,
          lat: from.lat + (to.lat - from.lat) * nextProgress,
          lon: from.lon + (to.lon - from.lon) * nextProgress,
          type: 'rest',
          timezone: from.timezone,
        };

        this.addDriveSegment(
          state,
          currentFrom,
          intermediateStop,
          drivableMiles,
          drivableHours,
          subSegCount === 1 ? weather : [],
          subSegCount === 1 ? (geometry ?? undefined) : undefined,
        );

        remainingMiles -= drivableMiles;
        remainingHours -= drivableHours;

        // Now insert rest/break for the next driving period
        const restDecision = this.decideRest(state, remainingHours, params, stops, stopIdx);
        await this.applyRestDecision(state, restDecision);
      }
    }
  }

  addDriveSegment(
    state: SimulationState,
    from: ResolvedStop,
    to: ResolvedStop,
    distanceMiles: number,
    driveTimeHours: number,
    weather: WeatherAlert[],
    geometry?: string,
  ): void {
    const arrival = new Date(state.currentTime.getTime() + driveTimeHours * 3600000);

    state.hosState = this.hosEngine.simulateAfterDriving(state.hosState, driveTimeHours, driveTimeHours);

    const segment: SegmentResult = {
      segmentId: `seg-${++state.segmentCounter}`,
      sequenceOrder: state.segmentCounter,
      segmentType: 'drive',
      fromLocation: from.name,
      toLocation: to.name,
      fromLat: from.lat,
      fromLon: from.lon,
      toLat: to.lat,
      toLon: to.lon,
      distanceMiles,
      driveTimeHours,
      estimatedArrival: arrival,
      estimatedDeparture: new Date(state.currentTime),
      hosStateAfter: { ...state.hosState },
      weatherAlerts: weather.length > 0 ? weather : undefined,
      routeGeometry: geometry,
      timezone: to.timezone,
    };

    state.segments.push(segment);
    state.currentTime = arrival;
    state.currentLat = to.lat;
    state.currentLon = to.lon;
    state.currentLocation = to.name;
    state.totalDistanceMiles += distanceMiles;
    state.totalDriveTimeHours += driveTimeHours;

    state.fuelRemainingGallons -= distanceMiles / state.mpg;

    const currentDay = state.dailyBreakdown[state.dailyBreakdown.length - 1];
    if (currentDay) {
      currentDay.driveHours += driveTimeHours;
      currentDay.onDutyHours += driveTimeHours;
      currentDay.segments++;
    }
  }

  /**
   * Reconcile arrival against the stop's appointment window.
   *  - Early  → insert an off-duty wait segment until the window opens.
   *  - Late   → push a feasibility issue (the load misses its appointment).
   * Returns minutes of slack (+) or minutes late (−) at dock start, or undefined
   * when the stop has no appointment window.
   */
  applyAppointmentWindow(state: SimulationState, stop: ResolvedStop): number | undefined {
    const window = stop.appointmentWindow;
    if (!window) return undefined;

    if (state.currentTime < window.start) {
      // Arrived early — wait off-duty until the window opens. For an
      // appointment-strict facility the driver can't enter early, so the wait is
      // off-site (at a truck stop nearby), not in the shipper's yard.
      const offSite = stop.entryPolicy === STOP_ENTRY_POLICY.APPOINTMENT_STRICT;
      this.addWaitSegment(state, stop, window.start, offSite);
      const slackMs = window.end.getTime() - state.currentTime.getTime();
      return Math.round(slackMs / 60000);
    }

    if (state.currentTime > window.end) {
      const lateMin = Math.round((state.currentTime.getTime() - window.end.getTime()) / 60000);
      state.feasibilityIssues.push(
        `Late arrival at ${stop.customerName ?? stop.name}: ${this.formatMinutes(lateMin)} after the ` +
          `${this.formatClock(window.end, stop.timezone)} appointment window closes`,
      );
      return -lateMin;
    }

    // On time — minutes of slack remaining before the window closes.
    return Math.round((window.end.getTime() - state.currentTime.getTime()) / 60000);
  }

  addWaitSegment(state: SimulationState, stop: ResolvedStop, until: Date, offSite = false): void {
    const waitHours = (until.getTime() - state.currentTime.getTime()) / 3600000;
    if (waitHours <= 0.01) return;

    const arrival = new Date(state.currentTime);
    const where = offSite ? `a truck stop near ${stop.customerName ?? stop.name}` : (stop.customerName ?? stop.name);

    const segment: SegmentResult = {
      segmentId: `seg-${++state.segmentCounter}`,
      sequenceOrder: state.segmentCounter,
      segmentType: 'wait',
      // The wait is for the upcoming stop's action (you're waiting *for a pickup*).
      actionType: stop.type,
      fromLocation: stop.name,
      toLocation: stop.name,
      fromLat: stop.lat,
      fromLon: stop.lon,
      toLat: stop.lat,
      toLon: stop.lon,
      restDurationHours: waitHours,
      restType: 'appointment_wait',
      restReason: `Waiting ${offSite ? 'off-site ' : ''}for appointment window to open at ${stop.customerName ?? stop.name}`,
      customerName: stop.customerName,
      estimatedArrival: arrival,
      estimatedDeparture: new Date(until),
      hosStateAfter: { ...state.hosState },
      timezone: stop.timezone,
      decisionReason: {
        summary: `Wait ${this.formatMinutes(Math.round(waitHours * 60))} for the appointment window${offSite ? ' (off-site)' : ''}`,
        details: `Arrived before the ${stop.customerName ?? stop.name} window opens.${offSite ? ' This facility does not allow early entry, so the driver waits at ' + where + '.' : ''} Driver waits off-duty until ${this.formatClock(until, stop.timezone)} — this off-duty time does not consume the 14-hour duty window.`,
        trigger: 'appointment_window_wait',
        hosStateAtDecision: {
          hoursDriven: state.hosState.hoursDriven,
          onDutyTime: state.hosState.onDutyTime,
          hoursSinceBreak: state.hosState.hoursSinceBreak,
          cycleHoursUsed: state.hosState.cycleHoursUsed,
        },
      },
    };

    state.segments.push(segment);
    state.currentTime = new Date(until);

    const currentDay = state.dailyBreakdown[state.dailyBreakdown.length - 1];
    if (currentDay) currentDay.segments++;
  }

  addDockSegment(
    state: SimulationState,
    stop: ResolvedStop,
    dockHours: number,
    isDocktimeConverted: boolean,
    arrivalBufferMinutes?: number,
    scheduledDockHours?: number,
    detentionHours?: number,
  ): void {
    const arrival = new Date(state.currentTime);
    const departure = new Date(state.currentTime.getTime() + dockHours * 3600000);
    // Plain-English dwell note when this customer's history adds expected detention.
    const detentionNote =
      detentionHours && detentionHours > 0.01 && scheduledDockHours != null
        ? `Scheduled dock ${this.formatMinutes(Math.round(scheduledDockHours * 60))} + ${this.formatMinutes(
            Math.round(detentionHours * 60),
          )} expected detention (this customer's median) = ${this.formatMinutes(Math.round(dockHours * 60))} total dwell.`
        : undefined;

    const segment: SegmentResult = {
      segmentId: `seg-${++state.segmentCounter}`,
      sequenceOrder: state.segmentCounter,
      segmentType: 'dock',
      fromLocation: stop.name,
      toLocation: stop.name,
      fromLat: stop.lat,
      fromLon: stop.lon,
      toLat: stop.lat,
      toLon: stop.lon,
      dockDurationHours: dockHours,
      customerName: stop.customerName,
      actionType: stop.type,
      isDocktimeConverted,
      estimatedArrival: arrival,
      estimatedDeparture: departure,
      hosStateAfter: { ...state.hosState },
      timezone: stop.timezone,
      appointmentWindow: stop.appointmentWindow,
      arrivalBufferMinutes,
      decisionReason: isDocktimeConverted
        ? {
            summary: `Dock time (${dockHours}h) converted to off-duty rest at ${stop.customerName ?? stop.name}`,
            details: `Dispatcher marked this ${stop.type} dock time as rest-eligible. ${dockHours}h parked at facility counts as off-duty rest, resetting HOS daily clocks.${detentionNote ? ' ' + detentionNote : ''}`,
            trigger: 'dock_rest_conversion',
            hosStateAtDecision: {
              hoursDriven: state.hosState.hoursDriven,
              onDutyTime: state.hosState.onDutyTime,
              hoursSinceBreak: state.hosState.hoursSinceBreak,
              cycleHoursUsed: state.hosState.cycleHoursUsed,
            },
          }
        : detentionNote
          ? {
              summary: `Dock at ${stop.customerName ?? stop.name} — detention-adjusted dwell`,
              details: detentionNote,
              trigger: 'detention_adjusted_dwell',
              hosStateAtDecision: {
                hoursDriven: state.hosState.hoursDriven,
                onDutyTime: state.hosState.onDutyTime,
                hoursSinceBreak: state.hosState.hoursSinceBreak,
                cycleHoursUsed: state.hosState.cycleHoursUsed,
              },
            }
          : undefined,
    };

    state.segments.push(segment);
    state.currentTime = departure;

    const currentDay = state.dailyBreakdown[state.dailyBreakdown.length - 1];
    if (currentDay) {
      if (!isDocktimeConverted) {
        currentDay.onDutyHours += dockHours;
      }
      currentDay.segments++;
    }
  }

  addRestSegment(
    state: SimulationState,
    restType: string,
    restHours: number,
    reason: string,
    decisionReason?: SegmentResult['decisionReason'],
  ): void {
    const arrival = new Date(state.currentTime);
    const departure = new Date(state.currentTime.getTime() + restHours * 3600000);

    const segment: SegmentResult = {
      segmentId: `seg-${++state.segmentCounter}`,
      sequenceOrder: state.segmentCounter,
      segmentType: 'rest',
      fromLocation: state.currentLocation,
      toLocation: state.currentLocation,
      fromLat: state.currentLat,
      fromLon: state.currentLon,
      toLat: state.currentLat,
      toLon: state.currentLon,
      restDurationHours: restHours,
      restType,
      restReason: reason,
      estimatedArrival: arrival,
      estimatedDeparture: departure,
      hosStateAfter: { ...state.hosState },
      decisionReason,
    };

    state.segments.push(segment);
    state.currentTime = departure;

    const currentDay = state.dailyBreakdown[state.dailyBreakdown.length - 1];
    if (currentDay) {
      currentDay.restStops++;
      currentDay.segments++;
    }
  }

  insertBreak(state: SimulationState): void {
    const arrival = new Date(state.currentTime);
    const departure = new Date(state.currentTime.getTime() + BREAK_DURATION_HOURS * 3600000);

    const segment: SegmentResult = {
      segmentId: `seg-${++state.segmentCounter}`,
      sequenceOrder: state.segmentCounter,
      segmentType: 'break',
      fromLocation: state.currentLocation,
      toLocation: state.currentLocation,
      fromLat: state.currentLat,
      fromLon: state.currentLon,
      toLat: state.currentLat,
      toLon: state.currentLon,
      restDurationHours: BREAK_DURATION_HOURS,
      restType: 'mandatory_break',
      restReason: '30-minute break required after 8 hours of driving',
      estimatedArrival: arrival,
      estimatedDeparture: departure,
      hosStateAfter: { ...state.hosState },
      decisionReason: {
        summary: `30-min break after ${state.hosState.drivingHoursSinceBreak.toFixed(1)}h of driving`,
        details: `FMCSA §395.3 requires a 30-minute break after 8 cumulative hours of driving time. ${state.hosState.drivingHoursSinceBreak.toFixed(1)}h of driving elapsed since the last break.`,
        trigger: 'hos_break_requirement',
        hosStateAtDecision: {
          hoursDriven: state.hosState.hoursDriven,
          onDutyTime: state.hosState.onDutyTime,
          hoursSinceBreak: state.hosState.hoursSinceBreak,
          cycleHoursUsed: state.hosState.cycleHoursUsed,
        },
      },
    };

    state.hosState = {
      ...state.hosState,
      hoursSinceBreak: 0,
      drivingHoursSinceBreak: 0,
    };

    segment.hosStateAfter = { ...state.hosState };

    state.segments.push(segment);
    state.currentTime = departure;
  }

  async insertFuelStop(
    state: SimulationState,
    from: ResolvedStop,
    to: ResolvedStop,
    params: SimulationParams,
  ): Promise<void> {
    const filter = state.acceptedBrands.length > 0 ? { acceptedBrands: state.acceptedBrands } : undefined;

    const fuelStops = await params.fuelStopFinder.findAlongCorridor(
      from.lat,
      from.lon,
      to.lat,
      to.lon,
      params.maxDetourMiles,
      filter,
    );

    if (fuelStops.length === 0) {
      state.feasibilityIssues.push(
        `No fuel stops found between ${from.name} and ${to.name} within ${params.maxDetourMiles} miles`,
      );
      state.fuelRemainingGallons = state.fuelCapacityGallons;
      return;
    }

    const priceSourceByStop = new Map<string, 'LIVE' | 'ESTIMATED' | 'NOT_AVAILABLE'>();
    for (const stop of fuelStops) {
      if (stop.fuelPricePerGallon === 0) {
        const pricing = await params.fuelPricer.getPriceForStop(
          stop,
          state.acceptedBrands,
          params.estimatedDieselPrice,
        );
        stop.fuelPricePerGallon = pricing.pricePerGallon;
        priceSourceByStop.set(stop.stopId, pricing.source ?? 'ESTIMATED');
      } else {
        priceSourceByStop.set(stop.stopId, 'LIVE');
      }
    }

    fuelStops.sort((a, b) => a.fuelPricePerGallon - b.fuelPricePerGallon || a.distanceFromRoute - b.distanceFromRoute);

    const fuelStop = fuelStops[0];
    const fuelPriceSource = priceSourceByStop.get(fuelStop.stopId) ?? 'ESTIMATED';
    const priceLabel =
      fuelPriceSource === 'LIVE'
        ? `$${fuelStop.fuelPricePerGallon.toFixed(2)}/gal`
        : `~$${fuelStop.fuelPricePerGallon.toFixed(2)}/gal (estimated — connect a fuel-card provider for live prices)`;
    const gallonsNeeded = state.fuelCapacityGallons - state.fuelRemainingGallons;
    const fuelCost = gallonsNeeded * fuelStop.fuelPricePerGallon;

    const arrival = new Date(state.currentTime);
    const departure = new Date(state.currentTime.getTime() + FUELING_TIME_HOURS * 3600000);

    const segment: SegmentResult = {
      segmentId: `seg-${++state.segmentCounter}`,
      sequenceOrder: state.segmentCounter,
      segmentType: 'fuel',
      fromLocation: state.currentLocation,
      toLocation: fuelStop.name,
      fromLat: state.currentLat,
      fromLon: state.currentLon,
      toLat: fuelStop.lat,
      toLon: fuelStop.lon,
      fuelGallons: gallonsNeeded,
      fuelCostEstimate: fuelCost,
      fuelStationName: fuelStop.name,
      fuelPricePerGallon: fuelStop.fuelPricePerGallon,
      detourMiles: fuelStop.distanceFromRoute,
      estimatedArrival: arrival,
      estimatedDeparture: departure,
      hosStateAfter: { ...state.hosState },
      decisionReason: {
        summary: `Fuel at ${Math.round((state.fuelRemainingGallons / state.fuelCapacityGallons) * 100)}% (${Math.round(state.fuelRemainingGallons)}gal remaining, ${FUEL_RESERVE_GALLONS}gal reserve threshold)`,
        details: `Selected ${fuelStop.name} at ${priceLabel}, ${fuelStop.distanceFromRoute.toFixed(1)}mi detour. Need ${Math.round(gallonsNeeded)}gal to fill.${state.acceptedBrands.length > 0 ? ` Brand-filtered to ${state.acceptedBrands.length} accepted brands.` : ''}`,
        alternativesCount: fuelStops.length,
        trigger: 'fuel_reserve_threshold',
        hosStateAtDecision: {
          hoursDriven: state.hosState.hoursDriven,
          onDutyTime: state.hosState.onDutyTime,
          hoursSinceBreak: state.hosState.hoursSinceBreak,
          cycleHoursUsed: state.hosState.cycleHoursUsed,
        },
      },
    };

    state.hosState = this.hosEngine.simulateAfterDriving(state.hosState, 0, FUELING_TIME_HOURS);
    segment.hosStateAfter = { ...state.hosState };

    state.segments.push(segment);
    state.currentTime = departure;
    state.currentLat = fuelStop.lat;
    state.currentLon = fuelStop.lon;
    state.currentLocation = fuelStop.name;
    state.fuelRemainingGallons = state.fuelCapacityGallons;
    state.totalCostEstimate += fuelCost;

    const currentDay = state.dailyBreakdown[state.dailyBreakdown.length - 1];
    if (currentDay) {
      currentDay.onDutyHours += FUELING_TIME_HOURS;
      currentDay.segments++;
    }
  }

  async insertCombinedFuelRestStop(
    state: SimulationState,
    from: ResolvedStop,
    to: ResolvedStop,
    params: SimulationParams,
    stops: ResolvedStop[],
    currentStopIdx: number,
    neededDriveHours: number,
  ): Promise<boolean> {
    if (!params.fuelStopFinder.findTruckStopsNear) {
      return false;
    }

    const midLat = (from.lat + to.lat) / 2;
    const midLon = (from.lon + to.lon) / 2;
    const filter = state.acceptedBrands.length > 0 ? { acceptedBrands: state.acceptedBrands } : undefined;

    const combinedStops = await params.fuelStopFinder.findTruckStopsNear(
      midLat,
      midLon,
      params.maxDetourMiles + 15,
      filter,
    );

    if (combinedStops.length === 0) return false;

    const truckStop = combinedStops[0];

    let fuelPriceSource: 'LIVE' | 'ESTIMATED' | 'NOT_AVAILABLE' = 'LIVE';
    if (truckStop.fuelPricePerGallon === 0) {
      const pricing = await params.fuelPricer.getPriceForStop(
        truckStop,
        state.acceptedBrands,
        params.estimatedDieselPrice,
      );
      truckStop.fuelPricePerGallon = pricing.pricePerGallon;
      fuelPriceSource = pricing.source ?? 'ESTIMATED';
    }

    const restDecision = this.decideRest(state, neededDriveHours, params, stops, currentStopIdx);

    if (restDecision.type === 'none' || restDecision.type === 'break_30min') {
      return false;
    }

    const gallonsNeeded = state.fuelCapacityGallons - state.fuelRemainingGallons;
    const fuelCost = gallonsNeeded * truckStop.fuelPricePerGallon;

    const fuelArrival = new Date(state.currentTime);
    const fuelDeparture = new Date(state.currentTime.getTime() + FUELING_TIME_HOURS * 3600000);

    const fuelSegment: SegmentResult = {
      segmentId: `seg-${++state.segmentCounter}`,
      sequenceOrder: state.segmentCounter,
      segmentType: 'fuel',
      fromLocation: state.currentLocation,
      toLocation: truckStop.name,
      fromLat: state.currentLat,
      fromLon: state.currentLon,
      toLat: truckStop.lat,
      toLon: truckStop.lon,
      fuelGallons: gallonsNeeded,
      fuelCostEstimate: fuelCost,
      fuelStationName: truckStop.name,
      fuelPricePerGallon: truckStop.fuelPricePerGallon,
      detourMiles: truckStop.distanceFromRoute,
      estimatedArrival: fuelArrival,
      estimatedDeparture: fuelDeparture,
      hosStateAfter: { ...state.hosState },
      decisionReason: {
        summary: `Combined fuel + rest at ${truckStop.name} (one stop instead of two)`,
        details: `Fuel and the required rest were due close together, so they're combined at ${truckStop.name} at ${
          fuelPriceSource === 'LIVE'
            ? `$${truckStop.fuelPricePerGallon.toFixed(2)}/gal`
            : `~$${truckStop.fuelPricePerGallon.toFixed(2)}/gal (estimated — connect a fuel-card provider for live prices)`
        }, ${truckStop.distanceFromRoute.toFixed(1)}mi detour — saving a separate stop.`,
        trigger: 'combined_fuel_rest',
        hosStateAtDecision: {
          hoursDriven: state.hosState.hoursDriven,
          onDutyTime: state.hosState.onDutyTime,
          hoursSinceBreak: state.hosState.hoursSinceBreak,
          cycleHoursUsed: state.hosState.cycleHoursUsed,
        },
      },
    };

    state.hosState = this.hosEngine.simulateAfterDriving(state.hosState, 0, FUELING_TIME_HOURS);
    fuelSegment.hosStateAfter = { ...state.hosState };

    state.segments.push(fuelSegment);
    state.currentTime = fuelDeparture;
    state.currentLat = truckStop.lat;
    state.currentLon = truckStop.lon;
    state.currentLocation = truckStop.name;
    state.fuelRemainingGallons = state.fuelCapacityGallons;
    state.totalCostEstimate += fuelCost;

    const currentDay = state.dailyBreakdown[state.dailyBreakdown.length - 1];
    if (currentDay) {
      currentDay.onDutyHours += FUELING_TIME_HOURS;
      currentDay.segments++;
    }

    await this.applyRestDecision(state, restDecision);

    this.logger.debug(`Combined fuel+rest at ${truckStop.name} (${truckStop.brand})`);

    return true;
  }

  // ─── Weather & Geometry ───────────────────────────────────────────────────

  async checkWeatherForLeg(
    from: ResolvedStop,
    to: ResolvedStop,
    departureTime: Date,
    params: SimulationParams,
  ): Promise<WeatherAlert[]> {
    try {
      return await params.weatherChecker.check(
        { lat: from.lat, lon: from.lon },
        { lat: to.lat, lon: to.lon },
        departureTime,
      );
    } catch (err) {
      this.logger.warn(`Weather check failed for leg ${from.name}->${to.name}: ${err}`);
      return [];
    }
  }

  getMaxWeatherMultiplier(alerts: WeatherAlert[]): number {
    if (alerts.length === 0) return 1.0;
    return Math.max(...alerts.map((a) => a.driveTimeMultiplier));
  }

  async getRouteGeometry(from: ResolvedStop, to: ResolvedStop, params: SimulationParams): Promise<string | null> {
    try {
      return await params.routeGeometryFetcher.getGeometry(
        { lat: from.lat, lon: from.lon },
        { lat: to.lat, lon: to.lon },
      );
    } catch {
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  buildDockRestMap(
    dockRestStops?: Array<{
      stopId: string;
      truckParkedHours: number;
      convertToRest: boolean;
    }>,
  ): Map<string, { truckParkedHours: number; convertToRest: boolean }> {
    const map = new Map();
    if (dockRestStops) {
      for (const entry of dockRestStops) {
        map.set(entry.stopId, {
          truckParkedHours: entry.truckParkedHours,
          convertToRest: entry.convertToRest,
        });
      }
    }
    return map;
  }

  haversineDistance(a: ResolvedStop, b: ResolvedStop): number {
    const R = EARTH_RADIUS_MILES;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

    return R * c * 1.3;
  }

  matrixKey(fromId: string, toId: string): string {
    return `${fromId}:${toId}`;
  }

  /** "1h 30m", "45m", "2h" — for human-readable durations in narratives. */
  formatMinutes(totalMinutes: number): string {
    const mins = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  /** Wall-clock time at the stop's local timezone, e.g. "14:00 ET". */
  formatClock(date: Date, timezone?: string): string {
    const tz = timezone ?? 'America/New_York';
    const dt = DateTime.fromJSDate(date, { zone: tz });
    return dt.isValid ? dt.toFormat('HH:mm ZZZZ') : date.toISOString().slice(11, 16);
  }

  advanceDay(state: SimulationState, hoursAdvanced: number): void {
    const startOfRest = new Date(state.currentTime.getTime() - hoursAdvanced * 3600000);
    const startDay = startOfRest.toISOString().split('T')[0];
    const endDay = state.currentTime.toISOString().split('T')[0];

    if (startDay !== endDay) {
      state.dayCounter++;
      state.dailyBreakdown.push(this.newDayBreakdown(state.dayCounter, state.currentTime));
    }
  }

  newDayBreakdown(day: number, date: Date): DayBreakdown {
    return {
      day,
      date: date.toISOString().split('T')[0],
      driveHours: 0,
      onDutyHours: 0,
      segments: 0,
      restStops: 0,
    };
  }

  buildComplianceReport(simulation: SimulationState): ComplianceReport {
    const restSegments = simulation.segments.filter((s) => s.segmentType === 'rest');
    const breakSegments = simulation.segments.filter((s) => s.segmentType === 'break');

    // Peak HOS usage observed across the whole plan — a rule that was ever
    // pushed past its limit is a violation, even if a later reset cleared it.
    const peak = this.peakHosUsage(simulation.segments);

    return {
      isFullyCompliant: simulation.feasibilityIssues.length === 0,
      totalRestStops: restSegments.length,
      totalBreaks: breakSegments.length,
      total34hRestarts: restSegments.filter((s) => s.restType === 'restart_34h').length,
      totalSplitRests: restSegments.filter((s) => s.restType?.startsWith('split_')).length,
      dockTimeConversions: simulation.segments.filter((s) => s.isDocktimeConverted).length,
      rules: [
        this.deriveRule(
          '11-hour driving limit',
          peak.hoursDriven,
          HOS_CONSTANTS.MAX_DRIVE_HOURS,
          restSegments.length > 0,
        ),
        this.deriveRule('14-hour duty window', peak.onDutyTime, HOS_CONSTANTS.MAX_DUTY_HOURS, restSegments.length > 0),
        this.deriveRule(
          '30-minute break requirement',
          peak.drivingHoursSinceBreak,
          HOS_CONSTANTS.BREAK_TRIGGER_HOURS,
          breakSegments.length > 0,
        ),
        this.deriveRule(
          '10-hour off-duty rest',
          peak.hoursDriven,
          HOS_CONSTANTS.MAX_DRIVE_HOURS,
          restSegments.length > 0,
        ),
        this.deriveRule(
          '70-hour/8-day cycle',
          peak.cycleHoursUsed,
          HOS_CONSTANTS.MAX_CYCLE_HOURS,
          restSegments.some((s) => s.restType === 'restart_34h'),
        ),
      ],
    };
  }

  /** Highest value each HOS clock reached across all segments' post-state. */
  private peakHosUsage(segments: SegmentResult[]): {
    hoursDriven: number;
    onDutyTime: number;
    drivingHoursSinceBreak: number;
    cycleHoursUsed: number;
  } {
    const peak = { hoursDriven: 0, onDutyTime: 0, drivingHoursSinceBreak: 0, cycleHoursUsed: 0 };
    for (const seg of segments) {
      const hos = seg.hosStateAfter;
      if (!hos) continue;
      peak.hoursDriven = Math.max(peak.hoursDriven, hos.hoursDriven);
      peak.onDutyTime = Math.max(peak.onDutyTime, hos.onDutyTime);
      peak.drivingHoursSinceBreak = Math.max(peak.drivingHoursSinceBreak, hos.drivingHoursSinceBreak);
      peak.cycleHoursUsed = Math.max(peak.cycleHoursUsed, hos.cycleHoursUsed);
    }
    return peak;
  }

  /**
   * Derive a rule status from the worst usage observed:
   *  - violation: the clock was pushed past its limit (with a small tolerance)
   *  - addressed: a curing segment (rest/break/restart) was inserted to keep it legal
   *  - pass:      stayed clear of the limit with no intervention needed
   */
  private deriveRule(
    rule: string,
    peakValue: number,
    limit: number,
    wasAddressed: boolean,
  ): { rule: string; status: ComplianceRuleStatus; detail?: string } {
    const TOLERANCE = 0.01;
    if (peakValue > limit + TOLERANCE) {
      return {
        rule,
        status: 'violation',
        detail: `Reached ${peakValue.toFixed(1)}h against the ${limit}h limit — the plan could not stay legal here.`,
      };
    }
    if (wasAddressed) {
      return {
        rule,
        status: 'addressed',
        detail: `Kept legal — peaked at ${peakValue.toFixed(1)}h of ${limit}h before a rest/break reset the clock.`,
      };
    }
    return {
      rule,
      status: 'pass',
      detail: `Stayed within limits — peaked at ${peakValue.toFixed(1)}h of ${limit}h.`,
    };
  }

  buildCostBreakdown(state: SimulationState, params: SimulationParams): CostBreakdown {
    const fuelCost = state.segments
      .filter((s) => s.segmentType === 'fuel')
      .reduce((sum, s) => sum + (s.fuelCostEstimate ?? 0), 0);

    // Labor cost covers all on-duty hours (driving + dock + fueling), not just driving
    const totalOnDutyHours = state.dailyBreakdown.reduce((sum, d) => sum + d.onDutyHours, 0);
    const laborCost = totalOnDutyHours * params.laborCostPerHour;

    // Toll cost comes from the toll provider as a SourcedValue (cents). When no
    // toll feed is connected it is NOT_AVAILABLE — tollCost stays 0 but tollSource
    // tells the UI to render "not included", never a fabricated "free" route.
    const toll = params.tollEstimate;
    const tollSource = toll?.source ?? 'NOT_AVAILABLE';
    const tollCost = toll?.value != null ? toll.value / 100 : 0;
    const tollNote = toll?.note;

    const totalOperatingCost = fuelCost + laborCost + tollCost;
    const totalDistanceMiles = Math.round(state.totalDistanceMiles * 10) / 10;

    return {
      fuelCost: Math.round(fuelCost * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      tollCost: Math.round(tollCost * 100) / 100,
      tollSource,
      tollNote,
      totalOperatingCost: Math.round(totalOperatingCost * 100) / 100,
      costPerMile: totalDistanceMiles > 0 ? Math.round((totalOperatingCost / totalDistanceMiles) * 100) / 100 : 0,
      laborCostPerHour: params.laborCostPerHour,
    };
  }
}

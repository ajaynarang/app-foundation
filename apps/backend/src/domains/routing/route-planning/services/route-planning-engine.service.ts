import { Injectable, Logger, Inject, BadRequestException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutePlanStatus } from '@prisma/client';
import { DataSource, StopEntryPolicy } from '@sally/shared-types';
import { DEFAULT_FUEL_TANK_GALLONS, DEFAULT_MPG, DOCK_DEFAULT_HOURS } from '@sally/shared-types';
import { Configuration } from '../../../../config/configuration';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  ROUTING_PROVIDER,
  RoutingProvider,
  LatLon,
  RouteOptions,
  TruckProfile,
} from '../../providers/routing/routing-provider.interface';
import { WEATHER_PROVIDER, WeatherProvider, WeatherAlert } from '../../providers/weather/weather-provider.interface';
import { FUEL_DATA_PROVIDER, FuelDataProvider } from '../../providers/fuel/fuel-data-provider.interface';
import { TOLL_PROVIDER, TollProvider } from '../../providers/tolls/toll-provider.interface';
import { HOSRuleEngineService, HOSState } from '../../hos-compliance/services/hos-rule-engine.service';
import { RoutePlanPersistenceService, CreateSegmentData, CreatePlanData } from './route-plan-persistence.service';
import { IntegrationDataService } from '../../../integrations/services/integration-data.service';
import { OperationsSettingsService } from '../../../platform/settings/operations-settings.service';
import { FuelCardsService } from '../../../platform-services/fuel-cards/fuel-cards.service';
import { FuelPricingService } from '../../providers/fuel/fuel-pricing.service';
import { RouteSimulator, SegmentResult, ComplianceReport, DayBreakdown, CostBreakdown } from './route-simulator';
import { SimulationParams, ResolvedStop } from './route-simulator.interfaces';
import { buildAppointmentWindow } from './appointment-window';

// ─── Request / Response Types ────────────────────────────────────────────────

export interface RoutePlanRequest {
  driverId: string; // Driver.driverId (string identifier)
  vehicleId: string; // Vehicle.vehicleId (string identifier)
  loadIds: string[]; // Load.loadNumber[] (string identifiers)
  departureTime: Date;
  tenantId: number;
  optimizationPriority?: 'minimize_time' | 'minimize_cost' | 'balance';
  includePricing?: boolean;
  startFromCurrentLocation?: boolean;
  excludeCompletedStops?: string[];
  estimatedDieselPrice?: number;
  dispatcherParams?: {
    dockRestStops?: Array<{
      stopId: string;
      truckParkedHours: number;
      convertToRest: boolean;
    }>;
    preferredRestType?: 'auto' | 'full' | 'split_8_2' | 'split_7_3';
    avoidTollRoads?: boolean;
    maxDetourMilesForFuel?: number;
  };
  /**
   * Optional per-leg driver/vehicle overrides for relay route planning.
   * Key is the legId string. When provided, legs without pre-assigned drivers
   * will use the driver/vehicle from this map instead of being skipped.
   */
  legDriverMap?: Record<string, { driverId: string; vehicleId: string }>;
  /** @internal Used to prevent recursive relay detection when planning individual legs */
  _skipRelayDetection?: boolean;
  /** @internal Overrides the origin stop's display name (e.g. relay handoff facility). */
  _originNameOverride?: string;
}

/** "Given a must-arrive-by at a stop, what's the latest legal departure?" */
export interface LatestDepartureResult {
  /** Latest departure that still arrives by the deadline, or null if even leaving now misses it. */
  latestDeparture: Date | null;
  feasible: boolean;
  estimatedArrival: Date | null;
  message: string;
}

export interface RelayRoutePlanResult {
  type: 'relay';
  loadNumber: string;
  totalLegs: number;
  legs: Array<
    (RoutePlanResult & { legSequence: number; legId: string }) | { legSequence: number; legId: string; error: string }
  >;
  totalDistanceMiles: number;
  totalDriveTimeHours: number;
}

export interface RoutePlanResult {
  planId: string;
  status: string;
  isFeasible: boolean;
  feasibilityIssues: string[];
  totalDistanceMiles: number;
  totalDriveTimeHours: number;
  totalTripTimeHours: number;
  totalDrivingDays: number;
  totalCostEstimate: number;
  departureTime: Date;
  estimatedArrival: Date;
  segments: SegmentResult[];
  complianceReport: ComplianceReport;
  weatherAlerts: WeatherAlert[];
  dailyBreakdown: DayBreakdown[];
  costBreakdown?: CostBreakdown;
  initialFuelPercent?: number;
  /** Provenance of the HOS clocks the plan was built from: LIVE (ELD) vs ESTIMATED (DB fallback). */
  hosSource?: DataSource;
}

// Re-export types from simulator for backward compatibility
export type { SegmentResult, ComplianceReport, DayBreakdown, CostBreakdown };

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RoutePlanningEngineService {
  private readonly logger = new Logger(RoutePlanningEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROUTING_PROVIDER)
    private readonly routingProvider: RoutingProvider,
    @Inject(WEATHER_PROVIDER)
    private readonly weatherProvider: WeatherProvider,
    @Inject(FUEL_DATA_PROVIDER)
    private readonly fuelProvider: FuelDataProvider,
    @Inject(TOLL_PROVIDER)
    private readonly tollProvider: TollProvider,
    private readonly hosEngine: HOSRuleEngineService,
    private readonly persistenceService: RoutePlanPersistenceService,
    private readonly configService: ConfigService<Configuration>,
    @Inject(forwardRef(() => IntegrationDataService))
    private readonly integrationDataService: IntegrationDataService,
    private readonly operationsSettingsService: OperationsSettingsService,
    private readonly fuelCardsService: FuelCardsService,
    private readonly fuelPricingService: FuelPricingService,
    private readonly simulator: RouteSimulator,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────

  async planRoute(input: RoutePlanRequest): Promise<RoutePlanResult | RelayRoutePlanResult> {
    this.logger.log(
      `Planning route: driver=${input.driverId}, vehicle=${input.vehicleId}, ` +
        `loads=${input.loadIds.length}, departure=${input.departureTime.toISOString()}`,
    );

    // Relay detection: if single load is a relay, plan per-leg instead
    if (!input._skipRelayDetection && input.loadIds.length === 1) {
      const relayLoad = await this.prisma.load.findFirst({
        where: {
          loadNumber: input.loadIds[0],
          tenantId: input.tenantId,
          isRelay: true,
        },
        select: { id: true, loadNumber: true, isRelay: true },
      });
      if (relayLoad) {
        return this.planRelayRoute(relayLoad, input);
      }
    }

    const { simulation, planId, initialFuelPercent, driver, vehicle, hosSource } = await this.simulateRequest(input);

    const plan = await this.persistPlan(planId, simulation, input, driver, vehicle, initialFuelPercent);

    this.logger.log(
      `Route planned: ${planId}, ${simulation.segments.length} segments, ` +
        `${Math.round(simulation.totalDistanceMiles)}mi, feasible=${simulation.feasibilityIssues.length === 0}`,
    );

    return this.buildResponse(planId, simulation, plan, initialFuelPercent, hosSource);
  }

  /**
   * Preview a plan WITHOUT persisting — runs the full simulator with the given
   * params and returns the real totals. Powers the WhatIf panel's "Estimated
   * Impact" so the dispatcher sees the actual delta of changing rest type /
   * departure / toll avoidance, not a client-side heuristic.
   */
  async previewRoute(input: RoutePlanRequest): Promise<RoutePlanResult> {
    const { simulation, planId, initialFuelPercent, hosSource } = await this.simulateRequest(input);
    // No persistence: hand the in-memory simulation straight to the response builder.
    return this.buildResponse(planId, simulation, undefined, initialFuelPercent, hosSource);
  }

  /**
   * "Latest legal departure" planning (backwards-from-appointment): binary-search
   * the departure time so the plan still arrives at the final stop by `mustArriveBy`.
   * Returns the latest departure that works, or null if even leaving now is too late.
   *
   * Each probe is a non-persisting previewRoute, so this is read-only.
   */
  async findLatestDeparture(input: RoutePlanRequest, mustArriveBy: Date): Promise<LatestDepartureResult> {
    const TOLERANCE_MS = 5 * 60 * 1000; // 5-minute resolution
    const earliest = new Date(); // can't depart in the past
    let lo = earliest.getTime();
    let hi = mustArriveBy.getTime();

    // If leaving now already misses the deadline, it's infeasible.
    const nowPlan = await this.previewRoute({ ...input, departureTime: earliest });
    if (!nowPlan.estimatedArrival || nowPlan.estimatedArrival.getTime() > mustArriveBy.getTime()) {
      return {
        latestDeparture: null,
        feasible: false,
        estimatedArrival: nowPlan.estimatedArrival ?? null,
        message: `Even departing now, arrival is ${nowPlan.estimatedArrival?.toISOString() ?? 'unknown'}, after the ${mustArriveBy.toISOString()} deadline.`,
      };
    }

    // Binary search for the latest departure that still arrives in time.
    // Each probe is a full simulation (HERE matrix + weather/geometry), so cap the
    // iterations as a safety valve against runaway external-API cost / timeouts —
    // ~12 probes resolves any realistic window to well under the 5-min tolerance.
    const MAX_PROBES = 12;
    let best = earliest;
    let bestArrival = nowPlan.estimatedArrival;
    let probes = 0;
    while (hi - lo > TOLERANCE_MS && probes < MAX_PROBES) {
      probes++;
      const mid = new Date(lo + (hi - lo) / 2);
      const plan = await this.previewRoute({ ...input, departureTime: mid });
      const arrival = plan.estimatedArrival;
      if (arrival && arrival.getTime() <= mustArriveBy.getTime() && plan.isFeasible) {
        best = mid; // departing this late still makes it — try later
        bestArrival = arrival;
        lo = mid.getTime();
      } else {
        hi = mid.getTime(); // too late — pull the departure earlier
      }
    }

    return {
      latestDeparture: best,
      feasible: true,
      estimatedArrival: bestArrival,
      message: `Depart by ${best.toISOString()} to arrive by ${mustArriveBy.toISOString()}.`,
    };
  }

  /**
   * Shared resolve → route → simulate pipeline used by both planRoute (which then
   * persists) and previewRoute (which doesn't). Everything here is read-only.
   */
  private async simulateRequest(input: RoutePlanRequest): Promise<{
    simulation: Awaited<ReturnType<RouteSimulator['simulate']>>;
    planId: string;
    initialFuelPercent: number;
    driver: any;
    vehicle: any;
    hosSource: DataSource;
  }> {
    // Step 1: Resolve all entities from DB
    const driver = await this.resolveDriver(input.driverId, input.tenantId);
    const vehicle = await this.resolveVehicle(input.vehicleId, input.tenantId);
    let stops = await this.resolveLoadStops(input.loadIds, input.tenantId, input.departureTime);

    if (stops.length === 0) {
      throw new BadRequestException('No stops found for the provided load IDs');
    }

    // Filter out completed stops (for replan scenarios)
    if (input.excludeCompletedStops?.length) {
      stops = stops.filter((s) => !input.excludeCompletedStops.includes(s.stopId));
      if (stops.length === 0) {
        throw new BadRequestException('All stops are already completed');
      }
    }

    // Step 1b: Fetch live HOS via the ELD cache (falls back to DB clocks)
    const { state: liveHOS, source: hosSource } = await this.fetchLiveHOSState(driver, input.tenantId);

    // Step 1c: Load tenant settings
    const tenantSettings = await this.operationsSettingsService.getSettings(input.tenantId);

    // Step 1d: Load fuel card accepted brands
    const acceptedBrands = await this.loadAcceptedBrands();

    // Step 1e: Resolve vehicle specs (data-driven, not hardcoded)
    const vehicleTelematics = await this.prisma.vehicleTelematics.findUnique({
      where: { vehicleId: vehicle.id },
    });
    const fuelCapacity = vehicle.fuelCapacityGallons ?? DEFAULT_FUEL_TANK_GALLONS;
    const mpg = vehicle.mpg ?? DEFAULT_MPG;
    const currentFuel = vehicleTelematics?.fuelLevel
      ? (vehicleTelematics.fuelLevel / 100) * fuelCapacity
      : fuelCapacity; // assume full if no telematics
    const hasSleeperBerth = vehicle.hasSleeperBerth ?? true;

    // Step 2: Build location list for distance matrix
    let originLat = stops[0].lat;
    let originLon = stops[0].lon;

    // For replan: use current GPS location as origin
    if (input.startFromCurrentLocation) {
      const gpsLocation = await this.fetchVehicleGPS(vehicle, input.tenantId);
      if (gpsLocation) {
        originLat = gpsLocation.latitude;
        originLon = gpsLocation.longitude;
      }
    }

    const originStop: ResolvedStop = {
      id: 0,
      stopId: 'origin',
      name: input._originNameOverride ?? driver.name + ' (Start)',
      lat: originLat,
      lon: originLon,
      type: 'origin',
      timezone: driver.homeTerminalTimezone ?? 'America/New_York',
    };

    const allStops = [originStop, ...stops];
    const latLons: LatLon[] = allStops.map((s) => ({
      lat: s.lat,
      lon: s.lon,
      id: s.stopId,
    }));

    // Build truck-aware routing options (dimensions/weight/hazmat + toll avoidance)
    // so HERE routes around low bridges, weight limits, and hazmat-banned roads.
    const truckProfile = await this.buildTruckProfile(vehicle, input.loadIds, input.tenantId);
    const routeOptions: RouteOptions = {
      avoidTollRoads: input.dispatcherParams?.avoidTollRoads ?? false,
      truckProfile,
    };

    // Step 3: Get road distances (truck-profile aware)
    const distanceMatrix = await this.routingProvider.getDistanceMatrix(latLons, routeOptions);

    // Step 3b: Estimate tolls along the route. Returns NOT_AVAILABLE (never $0)
    // when no toll feed is connected — surfaced honestly in the cost breakdown.
    const tollEstimate = await this.tollProvider.estimateRouteToll(latLons, truckProfile);

    // Merge dispatcher params with tenant settings (dispatcher overrides tenant)
    const maxDetourMiles = input.dispatcherParams?.maxDetourMilesForFuel ?? tenantSettings?.maxFuelDetour ?? 15;
    const preferredRest =
      input.dispatcherParams?.preferredRestType ?? (tenantSettings?.preferFullRest ? 'full' : 'auto');
    const allowDockRest = tenantSettings?.allowDockRest ?? true;
    // tenantSettings.* are Decimal in the DB; SimulationParams uses number arithmetic
    const costPerMile = Number(tenantSettings?.costPerMile ?? 1.85);
    const laborCostPerHour = Number(tenantSettings?.laborCostPerHour ?? 25.0);
    const estimatedDieselPrice =
      input.estimatedDieselPrice ??
      (tenantSettings?.estimatedDieselPricePerGallon != null
        ? Number(tenantSettings.estimatedDieselPricePerGallon)
        : undefined);
    const splitSleeperThresholdHours = tenantSettings?.splitSleeperThresholdHours ?? 16;

    // Step 4: Build SimulationParams and delegate to simulator
    const simulationParams: SimulationParams = {
      stops: allStops,
      distanceMatrix,
      departureTime: input.departureTime,
      hosState: liveHOS,
      fuelCapacityGallons: fuelCapacity,
      mpg,
      currentFuelGallons: currentFuel,
      hasSleeperBerth,
      acceptedBrands,
      maxDetourMiles,
      preferredRest,
      allowDockRest,
      costPerMile,
      laborCostPerHour,
      splitSleeperThresholdHours,
      estimatedDieselPrice,
      tollEstimate,
      dispatcherDockRestStops: input.dispatcherParams?.dockRestStops,
      fuelStopFinder: {
        findAlongCorridor: (fromLat, fromLon, toLat, toLon, maxDetour, filter) =>
          this.fuelProvider.findFuelStopsAlongCorridor(fromLat, fromLon, toLat, toLon, maxDetour, filter),
        findTruckStopsNear: this.fuelProvider.findTruckStopsNearPoint
          ? (lat, lon, radius, filter) => this.fuelProvider.findTruckStopsNearPoint(lat, lon, radius, filter)
          : undefined,
      },
      fuelPricer: {
        getPriceForStop: (stop, cardTypes, override) =>
          this.fuelPricingService.getPriceForStop(stop, cardTypes, override),
      },
      weatherChecker: {
        check: (from, to, time) => this.weatherProvider.getWeatherAlongRoute([from, to], time),
      },
      routeGeometryFetcher: {
        getGeometry: async (from, to) => {
          try {
            const result = await this.routingProvider.getRoute(from, to, undefined, routeOptions);
            return result.geometry;
          } catch {
            return null;
          }
        },
      },
    };

    // Step 5: Run simulation
    const simulation = await this.simulator.simulate(simulationParams);

    // Step 6: Build plan ID + prefix segment IDs for global uniqueness
    const planId = this.generatePlanId();
    for (const seg of simulation.segments) {
      seg.segmentId = `${planId}-${seg.segmentId}`;
    }

    const initialFuelPercent = Math.round((currentFuel / fuelCapacity) * 100);

    return { simulation, planId, initialFuelPercent, driver, vehicle, hosSource };
  }

  // ─── Relay Route Planning ───────────────────────────────────────────────

  /**
   * Plan a relay load by creating one route plan per leg, sequentially.
   * Each leg's departure cascades from the previous leg's arrival + handoff buffer.
   */
  private async planRelayRoute(
    load: { id: number; loadNumber: string; isRelay: boolean },
    input: RoutePlanRequest,
  ): Promise<RelayRoutePlanResult> {
    const legs = await this.prisma.loadLeg.findMany({
      where: { loadId: load.id },
      orderBy: { sequence: 'asc' },
      include: {
        driver: true,
        vehicle: true,
        originStop: { include: { stop: true } },
        destStop: { include: { stop: true } },
      },
    });

    if (legs.length === 0) {
      throw new BadRequestException('Relay load has no legs defined');
    }

    const legPlans: RelayRoutePlanResult['legs'] = [];
    let previousArrival = input.departureTime;
    const HANDOFF_BUFFER_MS = 30 * 60 * 1000; // 30 minutes

    // Plan legs SEQUENTIALLY (not parallel — departure time cascades)
    for (const leg of legs) {
      // Resolve driver/vehicle: prefer legDriverMap overrides, fall back to pre-assigned
      const mapEntry = input.legDriverMap?.[leg.legId];
      const legDriverId = mapEntry?.driverId ?? leg.driver?.driverId;
      let legVehicleId = mapEntry?.vehicleId ?? leg.vehicle?.vehicleId;

      // If no vehicle specified, try the driver's assigned vehicle
      if (!legVehicleId && legDriverId) {
        const driverRecord = await this.prisma.driver.findFirst({
          where: { driverId: legDriverId },
          select: { assignedVehicle: { select: { vehicleId: true } } },
        });
        legVehicleId = driverRecord?.assignedVehicle?.vehicleId;
      }

      if (!legDriverId) {
        this.logger.warn(`Skipping unassigned leg ${leg.legId} (sequence ${leg.sequence}) — no driver`);
        legPlans.push({
          legSequence: leg.sequence,
          legId: leg.legId,
          error: 'Leg has no driver assigned',
        });
        continue;
      }

      if (!legVehicleId) {
        this.logger.warn(
          `Skipping leg ${leg.legId} (sequence ${leg.sequence}) — no vehicle and driver has no assigned vehicle`,
        );
        legPlans.push({
          legSequence: leg.sequence,
          legId: leg.legId,
          error: 'No vehicle assigned to leg or driver. Select a vehicle.',
        });
        continue;
      }

      // Build a per-leg RoutePlanRequest that reuses the full planRoute flow
      const legInput: RoutePlanRequest = {
        driverId: legDriverId,
        vehicleId: legVehicleId,
        loadIds: [load.loadNumber],
        departureTime: previousArrival,
        tenantId: input.tenantId,
        optimizationPriority: input.optimizationPriority,
        dispatcherParams: input.dispatcherParams,
        // Exclude stops outside this leg's boundaries
        excludeCompletedStops: await this.getStopsOutsideLeg(load.id, leg),
        _skipRelayDetection: true, // Prevent infinite recursion
        // Leg 1 starts at the driver's location; later legs begin where the
        // previous driver handed off — name the origin after that facility, not
        // "<driver> (Start)" pinned on a customer warehouse.
        _originNameOverride:
          leg.sequence > 1 ? `${leg.originStop?.stop?.name ?? 'Exchange point'} (Handoff)` : undefined,
      };

      try {
        const plan = (await this.planRoute(legInput)) as RoutePlanResult;

        // Link the persisted plan to this leg
        const planRecord = await this.prisma.routePlan.findUnique({
          where: { planId: plan.planId },
          select: { id: true },
        });
        if (planRecord) {
          await this.prisma.loadLeg.update({
            where: { id: leg.id },
            data: { routePlanId: planRecord.id },
          });
        }

        legPlans.push({
          ...plan,
          legSequence: leg.sequence,
          legId: leg.legId,
        });

        // Next leg departs after this one arrives + handoff buffer
        if (plan.estimatedArrival) {
          previousArrival = new Date(new Date(plan.estimatedArrival).getTime() + HANDOFF_BUFFER_MS);
        }
      } catch (error) {
        this.logger.error(`Failed to plan leg ${leg.legId}: ${error.message}`);
        legPlans.push({
          legSequence: leg.sequence,
          legId: leg.legId,
          error: error.message,
        });
      }
    }

    return {
      type: 'relay',
      loadNumber: load.loadNumber,
      totalLegs: legs.length,
      legs: legPlans,
      totalDistanceMiles: legPlans.reduce(
        (sum, p) => sum + ('totalDistanceMiles' in p ? p.totalDistanceMiles || 0 : 0),
        0,
      ),
      totalDriveTimeHours: legPlans.reduce(
        (sum, p) => sum + ('totalDriveTimeHours' in p ? p.totalDriveTimeHours || 0 : 0),
        0,
      ),
    };
  }

  /**
   * Get stop IDs that are OUTSIDE a given leg's boundaries (for excludeCompletedStops).
   * This lets planRoute filter to only the stops within this leg's origin→dest range.
   */
  private async getStopsOutsideLeg(
    loadId: number,
    leg: {
      originStop: { sequenceOrder: number };
      destStop: { sequenceOrder: number };
    },
  ): Promise<string[]> {
    const allLoadStops = await this.prisma.loadStop.findMany({
      where: { loadId },
      include: { stop: { select: { stopId: true } } },
      orderBy: { sequenceOrder: 'asc' },
    });

    return allLoadStops
      .filter((ls) => ls.sequenceOrder < leg.originStop.sequenceOrder || ls.sequenceOrder > leg.destStop.sequenceOrder)
      .map((ls) => ls.stop.stopId);
  }

  // ─── Step 1: Resolve Entities ────────────────────────────────────────────

  private async resolveDriver(driverId: string, tenantId: number) {
    const driver = await this.prisma.driver.findFirst({
      where: { driverId, tenantId },
    });
    if (!driver) {
      throw new BadRequestException(`Driver not found: ${driverId}`);
    }
    return driver;
  }

  private async resolveVehicle(vehicleId: string, tenantId: number) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { vehicleId, tenantId },
    });
    if (!vehicle) {
      throw new BadRequestException(`Vehicle not found: ${vehicleId}`);
    }
    return vehicle;
  }

  /**
   * Fetch live HOS clocks for a driver via the ELD-agnostic IntegrationDataService
   * cache (Redis → Postgres), keyed by the driver's own ID — no nonexistent
   * `samsaraDriverId` column. Returns the state plus its provenance: LIVE when the
   * ELD cache answered, ESTIMATED when we fell back to the driver's DB clocks.
   */
  private async fetchLiveHOSState(driver: any, tenantId: number): Promise<{ state: HOSState; source: DataSource }> {
    try {
      const hos = await this.integrationDataService.getDriverHOS(tenantId, driver.driverId);
      if (hos) {
        const maxDriveMs = 11 * 3600000;
        const maxShiftMs = 14 * 3600000;
        const maxCycleMs = 70 * 3600000;
        const maxBreakMs = 8 * 3600000;

        // timeUntilBreakMs is the FMCSA 8h-driving break clock → drivingHoursSinceBreak.
        // On-duty-since-break isn't separately exposed by ELD clocks — mirror it.
        const drivingSinceBreak = (maxBreakMs - hos.timeUntilBreakMs) / 3600000;
        return {
          source: 'LIVE',
          state: {
            hoursDriven: (maxDriveMs - hos.driveTimeRemainingMs) / 3600000,
            onDutyTime: (maxShiftMs - hos.shiftTimeRemainingMs) / 3600000,
            hoursSinceBreak: drivingSinceBreak,
            drivingHoursSinceBreak: drivingSinceBreak,
            cycleHoursUsed: (maxCycleMs - hos.cycleTimeRemainingMs) / 3600000,
            cycleDaysData: (driver.cycleDaysData as any[]) ?? [],
            splitRestState: undefined,
          },
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch live HOS for driver ${driver.driverId}, using DB fallback: ${err}`);
    }

    // Fallback to the driver's last-known DB clocks (estimate, not a live reading).
    return { state: this.buildInitialHOSState(driver), source: 'ESTIMATED' };
  }

  /**
   * Load accepted fuel brands from tenant's fuel card configuration.
   * Returns empty array if no cards configured (meaning accept all brands).
   */
  private async loadAcceptedBrands(): Promise<string[]> {
    try {
      const activeCards = await this.fuelCardsService.getActiveCardTypes();
      if (activeCards.length === 0) return [];

      const cardTypeIds = activeCards.map((c) => c.id);
      return await this.fuelCardsService.getBrandsAcceptingCards(cardTypeIds);
    } catch (err) {
      this.logger.warn(`Failed to load fuel card brands: ${err}`);
      return [];
    }
  }

  /**
   * Fetch the truck's current GPS location via the ELD-agnostic
   * IntegrationDataService cache, keyed by the vehicle's own ID. Returns null
   * when unavailable (replan then falls back to the first stop). This is what
   * makes "start from current location" on a replan genuinely start at the truck.
   */
  private async fetchVehicleGPS(
    vehicle: any,
    tenantId: number,
  ): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const location = await this.integrationDataService.getVehicleLocation(tenantId, vehicle.vehicleId);
      if (location && location.latitude !== 0) {
        return { latitude: location.latitude, longitude: location.longitude };
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch GPS for vehicle ${vehicle.vehicleId}: ${err}`);
    }
    return null;
  }

  private async resolveLoadStops(loadIds: string[], tenantId: number, departureTime: Date): Promise<ResolvedStop[]> {
    const loads = await this.prisma.load.findMany({
      where: {
        loadNumber: { in: loadIds },
        tenantId,
      },
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequenceOrder: 'asc' },
        },
        customer: { select: { avgDetentionMinutesP50: true } },
      },
    });

    if (loads.length !== loadIds.length) {
      const foundIds = loads.map((l) => l.loadNumber);
      const missing = loadIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestException(`Loads not found: ${missing.join(', ')}`);
    }

    const resolvedStops: ResolvedStop[] = [];
    const seen = new Set<string>();
    const missingCoords: string[] = [];

    for (const load of loads) {
      for (const loadStop of load.stops) {
        const stop = loadStop.stop;
        if (!stop.lat || !stop.lon) {
          missingCoords.push(`${stop.name} (${stop.stopId})`);
          continue;
        }

        // Deduplicate by (loadId, stopId, actionType)
        const key = `${load.id}-${stop.id}-${loadStop.actionType}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const actionType = loadStop.actionType as 'pickup' | 'delivery';
        const timezone = stop.timezone ?? 'America/New_York';
        // SQ-97 — timezone/DST-aware window via the shared helper (anchors on the
        // appointment date, not "today"). Falls back to facility operating hours
        // when there's no per-load window so we don't schedule arrival at a closed dock.
        const appointmentWindow = buildAppointmentWindow(loadStop, timezone, {
          operatingHours: stop.operatingHours,
          appointmentRequired: stop.appointmentRequired,
          referenceDate: departureTime,
        });

        resolvedStops.push({
          id: stop.id,
          stopId: stop.stopId,
          name: stop.name,
          lat: stop.lat,
          lon: stop.lon,
          type: actionType === 'pickup' ? 'pickup' : 'delivery',
          timezone,
          appointmentWindow,
          dockDurationHours: loadStop.estimatedDockHours ?? DOCK_DEFAULT_HOURS,
          customerName: load.customerName,
          loadNumber: load.loadNumber,
          entryPolicy: (stop as { entryPolicy?: StopEntryPolicy }).entryPolicy ?? StopEntryPolicy.FCFS,
          detentionP50Minutes: load.customer?.avgDetentionMinutesP50 ?? undefined,
        });
      }
    }

    if (missingCoords.length > 0) {
      this.logger.warn(`Stops missing coordinates: ${missingCoords.join(', ')}`);
    }

    if (resolvedStops.length === 0) {
      if (missingCoords.length > 0) {
        throw new BadRequestException(
          `All stops are missing coordinates. Geocode these stops before planning: ${missingCoords.join(', ')}`,
        );
      }
      throw new BadRequestException('No stops found for the provided load IDs');
    }

    return resolvedStops;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Build the truck profile HERE uses to avoid low bridges, weight/length limits,
   * and (for placarded loads) hazmat-prohibited roads. Dimensions come from the
   * vehicle; the hazmat category is the union across all loads on the trip.
   */
  private async buildTruckProfile(vehicle: any, loadIds: string[], tenantId: number): Promise<TruckProfile> {
    const loads = await this.prisma.load.findMany({
      where: { loadNumber: { in: loadIds }, tenantId },
      select: { hazmatClass: true, placardRequired: true },
    });

    const hazardousGoods = Array.from(
      new Set(
        loads
          .filter((l) => l.placardRequired || l.hazmatClass)
          .map((l) => this.hazmatClassToHereCategory(l.hazmatClass))
          .filter((c): c is string => Boolean(c)),
      ),
    );

    return {
      grossWeightLbs: vehicle.grossWeightLbs ?? undefined,
      heightInches: vehicle.heightInches ?? undefined,
      lengthInches: vehicle.lengthInches ?? undefined,
      axleCount: vehicle.axleCount ?? undefined,
      hazardousGoods: hazardousGoods.length > 0 ? hazardousGoods : undefined,
    };
  }

  /** Map a US DOT hazmat class (1–9) to a HERE `shippedHazardousGoods` category. */
  private hazmatClassToHereCategory(hazmatClass: string | null): string | undefined {
    if (!hazmatClass) return undefined;
    const primary = hazmatClass.trim().split(/[.\s]/)[0];
    const map: Record<string, string> = {
      '1': 'explosive',
      '2': 'gas',
      '3': 'flammable',
      '4': 'flammable',
      '5': 'organicPeroxide',
      '6': 'poison',
      '7': 'radioactive',
      '8': 'corrosive',
      '9': 'harmfulToWater',
    };
    return map[primary];
  }

  private buildInitialHOSState(driver: any): HOSState {
    const onDutySinceBreak = driver.currentHoursSinceBreak ?? 0;
    let onDutyTime = driver.currentOnDutyTime ?? 0;

    // Stateful clock (preferred): if the driver is currently ON_DUTY/DRIVING and we
    // know WHEN that status started, derive elapsed on-duty from the clock rather
    // than a stale accumulated float — this is what makes mid-day plans accurate.
    if (driver.dutyStatusAt && (driver.dutyStatus === 'ON_DUTY' || driver.dutyStatus === 'DRIVING')) {
      const elapsedHours = (Date.now() - new Date(driver.dutyStatusAt).getTime()) / 3600000;
      if (elapsedHours >= 0) {
        // Add elapsed-since-status-change to the stored base, capped at the 14h window.
        onDutyTime = Math.min(14, (driver.currentOnDutyTime ?? 0) + elapsedHours);
      }
    }

    return {
      hoursDriven: driver.currentHoursDriven ?? 0,
      onDutyTime,
      hoursSinceBreak: onDutySinceBreak,
      // No dedicated driving-since-break DB column yet — conservatively bound by
      // hours driven so we never under-trigger the break.
      drivingHoursSinceBreak: Math.min(onDutySinceBreak, driver.currentHoursDriven ?? 0),
      cycleHoursUsed: driver.cycleHoursUsed ?? 0,
      cycleDaysData: (driver.cycleDaysData as any[]) ?? [],
      splitRestState: undefined,
    };
  }

  private generatePlanId(): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `RP-${date}-${rand}`;
  }

  // ─── Persist ─────────────────────────────────────────────────────────────

  private async persistPlan(
    planId: string,
    simulation: {
      segments: SegmentResult[];
      totalDistanceMiles: number;
      totalDriveTimeHours: number;
      totalCostEstimate: number;
      dayCounter: number;
      dailyBreakdown: DayBreakdown[];
      feasibilityIssues: string[];
      complianceReport: ComplianceReport;
      costBreakdown: CostBreakdown;
    },
    input: RoutePlanRequest,
    driver: any,
    vehicle: any,
    initialFuelPercent: number,
  ) {
    const segments: CreateSegmentData[] = simulation.segments.map((seg) => ({
      segmentId: seg.segmentId,
      sequenceOrder: seg.sequenceOrder,
      fromLocation: seg.fromLocation,
      toLocation: seg.toLocation,
      segmentType: seg.segmentType,
      distanceMiles: seg.distanceMiles,
      driveTimeHours: seg.driveTimeHours,
      restType: seg.restType,
      restDurationHours: seg.restDurationHours,
      restReason: seg.restReason,
      fuelGallons: seg.fuelGallons,
      fuelCostEstimate: seg.fuelCostEstimate,
      fuelStationName: seg.fuelStationName,
      dockDurationHours: seg.dockDurationHours,
      customerName: seg.customerName,
      hosStateAfter: seg.hosStateAfter,
      estimatedArrival: seg.estimatedArrival,
      estimatedDeparture: seg.estimatedDeparture,
      fromLat: seg.fromLat,
      fromLon: seg.fromLon,
      toLat: seg.toLat,
      toLon: seg.toLon,
      timezone: seg.timezone,
      actionType: seg.actionType ?? seg.segmentType,
      appointmentWindow: seg.appointmentWindow
        ? { start: seg.appointmentWindow.start.toISOString(), end: seg.appointmentWindow.end.toISOString() }
        : undefined,
      fuelPricePerGallon: seg.fuelPricePerGallon,
      detourMiles: seg.detourMiles,
      isDocktimeConverted: seg.isDocktimeConverted,
      weatherAlerts: seg.weatherAlerts,
      decisionReason: seg.decisionReason,
      arrivalBufferMinutes: seg.arrivalBufferMinutes,
      routeGeometry: seg.routeGeometry,
      fuelStateAfter: undefined,
      stopId: undefined,
    }));

    // Resolve load internal IDs from loadNumber strings
    const loads = await this.prisma.load.findMany({
      where: {
        loadNumber: { in: input.loadIds },
        tenantId: input.tenantId,
      },
      select: { id: true },
    });

    const lastSegment = simulation.segments[simulation.segments.length - 1];
    const estimatedArrival = lastSegment?.estimatedArrival ?? input.departureTime;

    const totalTripTimeHours = (estimatedArrival.getTime() - input.departureTime.getTime()) / 3600000;

    const planData: CreatePlanData = {
      planId,
      driverId: driver.id,
      vehicleId: vehicle.id,
      tenantId: input.tenantId,
      status: RoutePlanStatus.DRAFT,
      optimizationPriority: input.optimizationPriority ?? 'minimize_time',
      totalDistanceMiles: simulation.totalDistanceMiles,
      totalDriveTimeHours: simulation.totalDriveTimeHours,
      totalOnDutyTimeHours: simulation.dailyBreakdown.reduce((sum, d) => sum + d.onDutyHours, 0),
      totalCostEstimate: simulation.totalCostEstimate,
      totalTripTimeHours,
      totalDrivingDays: simulation.dayCounter,
      isFeasible: simulation.feasibilityIssues.length === 0,
      feasibilityIssues: simulation.feasibilityIssues.length > 0 ? simulation.feasibilityIssues : undefined,
      complianceReport: simulation.complianceReport,
      costBreakdown: simulation.costBreakdown,
      initialFuelPercent,
      departureTime: input.departureTime,
      estimatedArrival,
      dispatcherParams: input.dispatcherParams,
      dailyBreakdown: simulation.dailyBreakdown,
      segments,
      loadIds: loads.map((l) => l.id),
    };

    return this.persistenceService.createPlan(planData);
  }

  // ─── Build Response ──────────────────────────────────────────────────────

  private buildResponse(
    planId: string,
    simulation: {
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
    },
    _plan: any,
    initialFuelPercent?: number,
    hosSource?: DataSource,
  ): RoutePlanResult {
    const lastSegment = simulation.segments[simulation.segments.length - 1];

    const totalDistanceMiles = Math.round(simulation.totalDistanceMiles * 10) / 10;
    const totalDriveTimeHours = Math.round(simulation.totalDriveTimeHours * 100) / 100;
    const totalTripTimeHours = lastSegment
      ? Math.round(
          ((lastSegment.estimatedArrival.getTime() - simulation.segments[0].estimatedDeparture.getTime()) / 3600000) *
            100,
        ) / 100
      : 0;

    return {
      planId,
      status: RoutePlanStatus.DRAFT,
      isFeasible: simulation.feasibilityIssues.length === 0,
      feasibilityIssues: simulation.feasibilityIssues,
      totalDistanceMiles,
      totalDriveTimeHours,
      totalTripTimeHours,
      totalDrivingDays: simulation.dayCounter,
      totalCostEstimate: Math.round(simulation.totalCostEstimate * 100) / 100,
      departureTime: simulation.segments[0]?.estimatedDeparture ?? new Date(),
      estimatedArrival: lastSegment?.estimatedArrival ?? new Date(),
      segments: simulation.segments,
      complianceReport: simulation.complianceReport,
      weatherAlerts: simulation.weatherAlerts,
      dailyBreakdown: simulation.dailyBreakdown,
      costBreakdown: simulation.costBreakdown,
      initialFuelPercent,
      hosSource,
    };
  }
}

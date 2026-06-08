import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutePlanStatus } from '@prisma/client';
import { RoutePlanningEngineService, RoutePlanRequest, RoutePlanResult } from '../route-planning-engine.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { HOSRuleEngineService } from '../../../hos-compliance/services/hos-rule-engine.service';
import { RoutePlanPersistenceService } from '../route-plan-persistence.service';
import { ROUTING_PROVIDER } from '../../../providers/routing/routing-provider.interface';
import { WEATHER_PROVIDER } from '../../../providers/weather/weather-provider.interface';
import { FUEL_DATA_PROVIDER } from '../../../providers/fuel/fuel-data-provider.interface';
import { TOLL_PROVIDER } from '../../../providers/tolls/toll-provider.interface';
import { IntegrationDataService } from '../../../../integrations/services/integration-data.service';
import { OperationsSettingsService } from '../../../../platform/settings/operations-settings.service';
import { FuelCardsService } from '../../../../platform-services/fuel-cards/fuel-cards.service';
import { FuelPricingService } from '../../../providers/fuel/fuel-pricing.service';
import { RouteSimulator } from '../route-simulator';
import { createMockPrisma } from '../../../../../test/mocks';
import { makeDriver, makeVehicle, makeLoad } from '../../../../../test/factories';

describe('RoutePlanningEngineService', () => {
  let service: RoutePlanningEngineService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const mockRoutingProvider = {
    getDistanceMatrix: jest.fn(),
    getRoute: jest.fn(),
  };

  const mockWeatherProvider = {
    getWeatherAlongRoute: jest.fn().mockResolvedValue([]),
  };

  const mockFuelProvider = {
    findFuelStopsAlongCorridor: jest.fn().mockResolvedValue([]),
  };

  const mockTollProvider = {
    estimateRouteToll: jest.fn().mockResolvedValue({ value: null, source: 'NOT_AVAILABLE' }),
  };

  const mockHosEngine = {
    createInitialState: jest.fn(),
    validateCompliance: jest.fn(),
  };

  const mockPersistence = {
    createPlan: jest.fn(),
  };

  const mockIntegrationData = {
    getDriverHOS: jest.fn().mockResolvedValue(null),
    getVehicleLocation: jest.fn().mockResolvedValue(null),
  };

  const mockOpsSettings = {
    getSettings: jest.fn().mockResolvedValue(null),
  };

  const mockFuelCards = {
    getActiveCardTypes: jest.fn().mockResolvedValue([]),
    getBrandsAcceptingCards: jest.fn().mockResolvedValue([]),
  };

  const mockFuelPricing = {
    getPriceForStop: jest.fn(),
  };

  const mockSimulator = {
    simulate: jest.fn(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutePlanningEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: ROUTING_PROVIDER, useValue: mockRoutingProvider },
        { provide: WEATHER_PROVIDER, useValue: mockWeatherProvider },
        { provide: FUEL_DATA_PROVIDER, useValue: mockFuelProvider },
        { provide: TOLL_PROVIDER, useValue: mockTollProvider },
        { provide: HOSRuleEngineService, useValue: mockHosEngine },
        { provide: RoutePlanPersistenceService, useValue: mockPersistence },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: IntegrationDataService, useValue: mockIntegrationData },
        { provide: OperationsSettingsService, useValue: mockOpsSettings },
        { provide: FuelCardsService, useValue: mockFuelCards },
        { provide: FuelPricingService, useValue: mockFuelPricing },
        { provide: RouteSimulator, useValue: mockSimulator },
      ],
    }).compile();

    service = module.get<RoutePlanningEngineService>(RoutePlanningEngineService);

    // Default: no live ELD data → engine falls back to DB clocks / first stop.
    mockIntegrationData.getDriverHOS.mockResolvedValue(null);
    mockIntegrationData.getVehicleLocation.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  const baseRequest: RoutePlanRequest = {
    driverId: 'drv-test-001',
    vehicleId: 'veh-test-001',
    loadIds: ['ld-test-001'],
    departureTime: new Date('2026-03-10T08:00:00Z'),
    tenantId: 1,
  };

  function setupSuccessfulPlan() {
    const driver = makeDriver({ id: 1, samsaraDriverId: null });
    const vehicle = makeVehicle({ id: 1, samsaraVehicleId: null });
    const load = makeLoad({
      id: 10,
      loadNumber: 'ld-test-001',
      stops: [
        {
          stop: {
            id: 1,
            stopId: 'stop-1',
            name: 'Pickup',
            lat: 32.78,
            lon: -96.8,
            timezone: 'America/Chicago',
          },
          actionType: 'pickup',
          sequenceOrder: 1,
        },
        {
          stop: {
            id: 2,
            stopId: 'stop-2',
            name: 'Delivery',
            lat: 33.75,
            lon: -84.39,
            timezone: 'America/New_York',
          },
          actionType: 'delivery',
          sequenceOrder: 2,
        },
      ],
    });

    prisma.driver.findFirst.mockResolvedValue(driver);
    prisma.vehicle.findFirst.mockResolvedValue(vehicle);
    prisma.vehicleTelematics.findUnique.mockResolvedValue(null);
    prisma.integrationConfig.findFirst.mockResolvedValue(null);
    prisma.load.findMany.mockResolvedValue([load]);

    mockRoutingProvider.getDistanceMatrix.mockResolvedValue([
      [0, 780],
      [780, 0],
    ]);

    const now = new Date();
    const arrival = new Date(now.getTime() + 12 * 3600000);
    mockSimulator.simulate.mockResolvedValue({
      segments: [
        {
          segmentId: 'seg-1',
          sequenceOrder: 1,
          segmentType: 'drive',
          distanceMiles: 780,
          driveTimeHours: 12,
          estimatedArrival: arrival,
          estimatedDeparture: now,
        },
      ],
      totalDistanceMiles: 780,
      totalDriveTimeHours: 12,
      totalCostEstimate: 1200,
      dayCounter: 1,
      dailyBreakdown: [{ day: 1, onDutyHours: 12 }],
      feasibilityIssues: [],
      complianceReport: { isCompliant: true },
      costBreakdown: {},
      weatherAlerts: [],
    });

    mockPersistence.createPlan.mockResolvedValue({ id: 1, planId: 'RP-TEST' });

    return { driver, vehicle, load };
  }

  // ─── Entity resolution errors ────────────────────────────────────────────

  describe('entity resolution', () => {
    it('should throw when driver not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(service.planRoute(baseRequest)).rejects.toThrow(BadRequestException);
    });

    it('should throw when vehicle not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.planRoute(baseRequest)).rejects.toThrow(BadRequestException);
    });

    it('should throw when no stops found for load IDs', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      prisma.vehicle.findFirst.mockResolvedValue(makeVehicle());
      prisma.vehicleTelematics.findUnique.mockResolvedValue(null);
      prisma.integrationConfig.findFirst.mockResolvedValue(null);
      prisma.load.findMany.mockResolvedValue([
        makeLoad({
          loadNumber: 'ld-test-001',
          stops: [],
        }),
      ]);

      await expect(service.planRoute(baseRequest)).rejects.toThrow(BadRequestException);
    });

    it('should throw when some loads not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      prisma.vehicle.findFirst.mockResolvedValue(makeVehicle());
      prisma.vehicleTelematics.findUnique.mockResolvedValue(null);
      prisma.integrationConfig.findFirst.mockResolvedValue(null);
      // Request has 1 loadNumber but findMany returns 0
      prisma.load.findMany.mockResolvedValue([]);

      await expect(service.planRoute(baseRequest)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Successful plan generation ──────────────────────────────────────────

  describe('plan generation', () => {
    it('should generate a plan with correct structure', async () => {
      setupSuccessfulPlan();

      const result = (await service.planRoute(baseRequest)) as RoutePlanResult;

      expect(result.planId).toBeDefined();
      expect(result.status).toBe(RoutePlanStatus.DRAFT);
      expect(result.totalDistanceMiles).toBeGreaterThan(0);
      expect(result.segments).toHaveLength(1);
    });

    it('should call simulator with resolved stops and distance matrix', async () => {
      setupSuccessfulPlan();

      await service.planRoute(baseRequest);

      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          stops: expect.arrayContaining([expect.objectContaining({ stopId: 'origin' })]),
          distanceMatrix: expect.any(Array),
          departureTime: baseRequest.departureTime,
        }),
      );
    });

    it('should persist plan via persistence service', async () => {
      setupSuccessfulPlan();

      await service.planRoute(baseRequest);

      expect(mockPersistence.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          status: RoutePlanStatus.DRAFT,
          totalDistanceMiles: 780,
        }),
      );
    });

    it('should filter completed stops in replan scenario', async () => {
      setupSuccessfulPlan();

      const request = {
        ...baseRequest,
        excludeCompletedStops: ['stop-1'],
      };

      const result = await service.planRoute(request);

      expect(result).toBeDefined();
    });

    it('should throw when all stops are excluded', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      prisma.vehicle.findFirst.mockResolvedValue(makeVehicle());
      prisma.vehicleTelematics.findUnique.mockResolvedValue(null);
      prisma.integrationConfig.findFirst.mockResolvedValue(null);
      prisma.load.findMany.mockResolvedValue([
        makeLoad({
          loadNumber: 'ld-test-001',
          stops: [
            {
              stop: {
                id: 1,
                stopId: 'stop-1',
                name: 'Pickup',
                lat: 32.78,
                lon: -96.8,
              },
              actionType: 'pickup',
              sequenceOrder: 1,
            },
          ],
        }),
      ]);

      await expect(
        service.planRoute({
          ...baseRequest,
          excludeCompletedStops: ['stop-1'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Relay routes (multi-driver handoff) ─────────────────────────────────

  describe('relay routes', () => {
    function setupRelay() {
      setupSuccessfulPlan();
      // The single load is a relay.
      prisma.load.findFirst.mockResolvedValue({ id: 10, loadNumber: 'ld-test-001', isRelay: true });
      // Two legs, sequenced, each with its own driver/vehicle + origin/dest stops.
      prisma.loadLeg.findMany.mockResolvedValue([
        {
          id: 1,
          legId: 'leg-1',
          sequence: 1,
          loadId: 10,
          driver: { driverId: 'drv-A' },
          vehicle: { vehicleId: 'veh-A' },
          originStop: { sequenceOrder: 1, stop: { name: 'Origin DC', stopId: 'stop-1' } },
          destStop: { sequenceOrder: 2, stop: { name: 'Memphis Exchange', stopId: 'stop-2' } },
        },
        {
          id: 2,
          legId: 'leg-2',
          sequence: 2,
          loadId: 10,
          driver: { driverId: 'drv-B' },
          vehicle: { vehicleId: 'veh-B' },
          originStop: { sequenceOrder: 2, stop: { name: 'Memphis Exchange', stopId: 'stop-2' } },
          destStop: { sequenceOrder: 3, stop: { name: 'Dest DC', stopId: 'stop-3' } },
        },
      ]);
      prisma.loadStop.findMany.mockResolvedValue([
        { sequenceOrder: 1, stop: { stopId: 'stop-1' } },
        { sequenceOrder: 2, stop: { stopId: 'stop-2' } },
        { sequenceOrder: 3, stop: { stopId: 'stop-3' } },
      ]);
      prisma.routePlan.findUnique.mockResolvedValue({ id: 99 });
      prisma.loadLeg.update.mockResolvedValue({ id: 1 });
    }

    it('plans one sub-plan per leg and returns a relay result', async () => {
      setupRelay();

      const result = (await service.planRoute(baseRequest)) as any;

      expect(result.type).toBe('relay');
      expect(result.loadNumber).toBe('ld-test-001');
      expect(result.totalLegs).toBe(2);
      expect(result.legs).toHaveLength(2);
      // Each leg got planned (the simulator ran per leg).
      expect(mockSimulator.simulate.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Each leg plan was linked back to its LoadLeg row.
      expect(prisma.loadLeg.update).toHaveBeenCalled();
    });

    it('names leg 2 origin as a Handoff, not "(Start)"', async () => {
      setupRelay();
      await service.planRoute(baseRequest);

      // Find the simulate call for leg 2 (its stops exclude stop-1; origin name overridden).
      const originNames = mockSimulator.simulate.mock.calls.map(
        (c: any[]) => c[0].stops.find((s: any) => s.stopId === 'origin')?.name,
      );
      expect(originNames.some((n: string) => /Handoff/.test(n))).toBe(true);
      expect(originNames.some((n: string) => /\(Start\)/.test(n))).toBe(true); // leg 1 still Start
    });

    it('reports an error for a leg with no driver instead of failing the whole relay', async () => {
      setupRelay();
      prisma.loadLeg.findMany.mockResolvedValue([
        {
          id: 1,
          legId: 'leg-1',
          sequence: 1,
          loadId: 10,
          driver: null,
          vehicle: null,
          originStop: { sequenceOrder: 1, stop: { name: 'Origin', stopId: 'stop-1' } },
          destStop: { sequenceOrder: 2, stop: { name: 'Exchange', stopId: 'stop-2' } },
        },
      ]);

      const result = (await service.planRoute(baseRequest)) as any;
      expect(result.type).toBe('relay');
      expect(result.legs[0].error).toMatch(/no driver/i);
    });
  });

  // ─── previewRoute (WhatIf — no persistence) ──────────────────────────────

  describe('previewRoute', () => {
    it('runs the simulator and returns totals WITHOUT persisting', async () => {
      setupSuccessfulPlan();

      const result = await service.previewRoute(baseRequest);

      expect(result.totalDistanceMiles).toBeGreaterThan(0);
      expect(result.isFeasible).toBe(true);
      // The whole point of a preview: it must NOT write a plan.
      expect(mockPersistence.createPlan).not.toHaveBeenCalled();
      // It still ran the real simulator.
      expect(mockSimulator.simulate).toHaveBeenCalled();
    });

    it('reflects changed params (toll avoidance flows into the route options)', async () => {
      setupSuccessfulPlan();
      await service.previewRoute({
        ...baseRequest,
        dispatcherParams: { avoidTollRoads: true },
      });
      // Toll avoidance reaches the routing provider for a real (not heuristic) delta.
      expect(mockRoutingProvider.getDistanceMatrix).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ avoidTollRoads: true }),
      );
    });
  });

  // ─── findLatestDeparture (backwards-from-appointment) ────────────────────

  describe('findLatestDeparture', () => {
    // A fixed 4h trip regardless of departure (mock simulate returns arrival =
    // departure + 4h) lets us assert the binary search lands on the right time.
    function setupFixedDurationPlan(tripHours: number) {
      setupSuccessfulPlan();
      mockSimulator.simulate.mockImplementation((params: any) => {
        const dep = new Date(params.departureTime);
        const arr = new Date(dep.getTime() + tripHours * 3600000);
        return Promise.resolve({
          segments: [{ segmentType: 'drive', estimatedDeparture: dep, estimatedArrival: arr }],
          totalDistanceMiles: 200,
          totalDriveTimeHours: tripHours,
          totalCostEstimate: 500,
          dayCounter: 1,
          dailyBreakdown: [{ day: 1, onDutyHours: tripHours }],
          feasibilityIssues: [],
          complianceReport: { isCompliant: true },
          costBreakdown: {},
          weatherAlerts: [],
        });
      });
    }

    it('finds a latest departure that still arrives by the deadline', async () => {
      setupFixedDurationPlan(4); // 4h trip
      const deadline = new Date(Date.now() + 10 * 3600000); // 10h from now

      const result = await service.findLatestDeparture(baseRequest, deadline);

      expect(result.feasible).toBe(true);
      expect(result.latestDeparture).not.toBeNull();
      // Latest departure ≈ deadline − 4h (within the 5-min search tolerance).
      const expectedMs = deadline.getTime() - 4 * 3600000;
      expect(Math.abs(result.latestDeparture.getTime() - expectedMs)).toBeLessThan(10 * 60 * 1000);
      // And it actually arrives by the deadline.
      expect(result.estimatedArrival.getTime()).toBeLessThanOrEqual(deadline.getTime());
    });

    it('returns infeasible when even leaving now misses the deadline', async () => {
      setupFixedDurationPlan(8); // 8h trip
      const deadline = new Date(Date.now() + 3 * 3600000); // only 3h away

      const result = await service.findLatestDeparture(baseRequest, deadline);

      expect(result.feasible).toBe(false);
      expect(result.latestDeparture).toBeNull();
      expect(result.message).toMatch(/after the/i);
    });
  });

  // ─── HOS state resolution (ELD-agnostic IntegrationDataService) ──────────

  describe('HOS state resolution', () => {
    it('falls back to the driver DB clocks (source ESTIMATED) when the ELD cache is empty', async () => {
      setupSuccessfulPlan();
      mockIntegrationData.getDriverHOS.mockResolvedValue(null);

      const result = (await service.planRoute(baseRequest)) as any;

      expect(result).toBeDefined();
      expect(mockIntegrationData.getDriverHOS).toHaveBeenCalledWith(baseRequest.tenantId, baseRequest.driverId);
      expect(result.hosSource).toBe('ESTIMATED');
    });

    it('uses live ELD HOS clocks (source LIVE) when the cache answers', async () => {
      setupSuccessfulPlan();
      mockIntegrationData.getDriverHOS.mockResolvedValue({
        driverId: baseRequest.driverId,
        currentDutyStatus: 'on_duty',
        driveTimeRemainingMs: 6 * 3600000, // 6h remaining = 5h driven
        shiftTimeRemainingMs: 10 * 3600000, // 10h remaining = 4h on duty
        timeUntilBreakMs: 5 * 3600000, // 5h remaining = 3h driving since break
        cycleTimeRemainingMs: 50 * 3600000, // 50h remaining = 20h used
        dataSource: 'SAMSARA_ELD',
        lastUpdated: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      });

      const result = (await service.planRoute(baseRequest)) as any;

      expect(result.hosSource).toBe('LIVE');
      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          hosState: expect.objectContaining({
            hoursDriven: 5,
            onDutyTime: 4,
            drivingHoursSinceBreak: 3,
            cycleHoursUsed: 20,
          }),
        }),
      );
    });

    it('derives on-duty from the stateful dutyStatusAt clock when ON_DUTY (§4.5)', async () => {
      setupSuccessfulPlan();
      mockIntegrationData.getDriverHOS.mockResolvedValue(null); // no ELD → DB path
      // Driver went ON_DUTY 3h ago with a stored base of 2h → ~5h on-duty.
      const threeHoursAgo = new Date(Date.now() - 3 * 3600000);
      prisma.driver.findFirst.mockResolvedValue(
        makeDriver({ id: 1, currentOnDutyTime: 2, dutyStatus: 'ON_DUTY', dutyStatusAt: threeHoursAgo }),
      );

      await service.planRoute(baseRequest);

      const simArg = mockSimulator.simulate.mock.calls[0][0];
      expect(simArg.hosState.onDutyTime).toBeGreaterThanOrEqual(4.9);
      expect(simArg.hosState.onDutyTime).toBeLessThanOrEqual(5.2);
    });

    it('falls back to DB clocks when the ELD lookup throws', async () => {
      setupSuccessfulPlan();
      prisma.driver.findFirst.mockResolvedValue(
        makeDriver({
          id: 1,
          currentHoursDriven: 2,
          currentOnDutyTime: 3,
          currentHoursSinceBreak: 1,
          cycleHoursUsed: 10,
        }),
      );
      mockIntegrationData.getDriverHOS.mockRejectedValue(new Error('cache unavailable'));

      const result = (await service.planRoute(baseRequest)) as any;

      expect(result.hosSource).toBe('ESTIMATED');
      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({ hosState: expect.objectContaining({ hoursDriven: 2, onDutyTime: 3 }) }),
      );
    });
  });

  // ─── GPS / Start from current location (IntegrationDataService) ─────────

  describe('startFromCurrentLocation', () => {
    it('uses the live truck GPS as origin when available', async () => {
      setupSuccessfulPlan();
      mockIntegrationData.getVehicleLocation.mockResolvedValue({
        vehicleId: baseRequest.vehicleId,
        latitude: 35.0,
        longitude: -90.0,
        speed: 0,
        heading: 0,
        timestamp: new Date().toISOString(),
      });

      const result = await service.planRoute({ ...baseRequest, startFromCurrentLocation: true });

      expect(result).toBeDefined();
      expect(mockIntegrationData.getVehicleLocation).toHaveBeenCalledWith(baseRequest.tenantId, baseRequest.vehicleId);
      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          stops: expect.arrayContaining([expect.objectContaining({ stopId: 'origin', lat: 35.0, lon: -90.0 })]),
        }),
      );
    });

    it('falls back to the first stop when GPS is unavailable', async () => {
      setupSuccessfulPlan();
      mockIntegrationData.getVehicleLocation.mockResolvedValue(null);

      const result = await service.planRoute({ ...baseRequest, startFromCurrentLocation: true });
      expect(result).toBeDefined();
    });

    it('falls back when GPS coords are zero', async () => {
      setupSuccessfulPlan();
      mockIntegrationData.getVehicleLocation.mockResolvedValue({
        vehicleId: baseRequest.vehicleId,
        latitude: 0,
        longitude: 0,
        speed: 0,
        heading: 0,
        timestamp: new Date().toISOString(),
      });

      const result = await service.planRoute({ ...baseRequest, startFromCurrentLocation: true });
      expect(result).toBeDefined();
    });

    it('falls back when the GPS lookup throws', async () => {
      setupSuccessfulPlan();
      mockIntegrationData.getVehicleLocation.mockRejectedValue(new Error('GPS unavailable'));

      const result = await service.planRoute({ ...baseRequest, startFromCurrentLocation: true });
      expect(result).toBeDefined();
    });
  });

  // ─── Fuel card brands ──────────────────────────────────────────────────

  describe('fuel card brand loading', () => {
    it('should load accepted brands when fuel cards are active', async () => {
      setupSuccessfulPlan();
      mockFuelCards.getActiveCardTypes.mockResolvedValue([{ id: 'comdata' }, { id: 'wex' }]);
      mockFuelCards.getBrandsAcceptingCards.mockResolvedValue(['Pilot', 'Loves']);

      await service.planRoute(baseRequest);

      expect(mockFuelCards.getActiveCardTypes).toHaveBeenCalled();
      expect(mockFuelCards.getBrandsAcceptingCards).toHaveBeenCalledWith(['comdata', 'wex']);
      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          acceptedBrands: ['Pilot', 'Loves'],
        }),
      );
    });

    it('should return empty array when no active cards', async () => {
      setupSuccessfulPlan();
      mockFuelCards.getActiveCardTypes.mockResolvedValue([]);

      await service.planRoute(baseRequest);

      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          acceptedBrands: [],
        }),
      );
    });

    it('should return empty array when fuel cards service fails', async () => {
      setupSuccessfulPlan();
      mockFuelCards.getActiveCardTypes.mockRejectedValue(new Error('DB error'));

      const result = await service.planRoute(baseRequest);
      expect(result).toBeDefined();
    });
  });

  // ─── Vehicle telematics / fuel ─────────────────────────────────────────

  describe('vehicle fuel state', () => {
    it('should use telematics fuel level when available', async () => {
      setupSuccessfulPlan();
      prisma.vehicleTelematics.findUnique.mockResolvedValue({
        fuelLevel: 50, // 50%
      });

      await service.planRoute(baseRequest);

      // Default tank: 200 gal, 50% = 100 gal
      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          currentFuelGallons: 100,
          fuelCapacityGallons: 200,
        }),
      );
    });

    it('should assume full tank when no telematics', async () => {
      setupSuccessfulPlan();
      prisma.vehicleTelematics.findUnique.mockResolvedValue(null);

      await service.planRoute(baseRequest);

      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          currentFuelGallons: 200,
        }),
      );
    });

    it('should use vehicle-specific fuel capacity and MPG', async () => {
      setupSuccessfulPlan();
      prisma.vehicle.findFirst.mockResolvedValue(
        makeVehicle({
          id: 1,
          fuelCapacityGallons: 150,
          mpg: 7.0,
          hasSleeperBerth: false,
        }),
      );

      await service.planRoute(baseRequest);

      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          fuelCapacityGallons: 150,
          mpg: 7.0,
          hasSleeperBerth: false,
        }),
      );
    });
  });

  // ─── Dispatcher params / tenant settings ──────────────────────────────

  describe('dispatcher params and tenant settings', () => {
    it('should use dispatcher params when provided', async () => {
      setupSuccessfulPlan();
      const request = {
        ...baseRequest,
        dispatcherParams: {
          preferredRestType: 'split_8_2' as const,
          maxDetourMilesForFuel: 25,
        },
        estimatedDieselPrice: 4.5,
      };

      await service.planRoute(request);

      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredRest: 'split_8_2',
          maxDetourMiles: 25,
          estimatedDieselPrice: 4.5,
        }),
      );
    });

    it('should use tenant settings as defaults when dispatcher params missing', async () => {
      setupSuccessfulPlan();
      mockOpsSettings.getSettings.mockResolvedValue({
        maxFuelDetour: 20,
        preferFullRest: true,
        allowDockRest: false,
        costPerMile: 2.0,
        laborCostPerHour: 30.0,
        estimatedDieselPricePerGallon: 4.2,
        splitSleeperThresholdHours: 18,
      });

      await service.planRoute(baseRequest);

      expect(mockSimulator.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxDetourMiles: 20,
          preferredRest: 'full',
          allowDockRest: false,
          costPerMile: 2.0,
          laborCostPerHour: 30.0,
          estimatedDieselPrice: 4.2,
          splitSleeperThresholdHours: 18,
        }),
      );
    });
  });

  // ─── Relay route planning ──────────────────────────────────────────────

  describe('relay route planning', () => {
    it('should detect relay load and plan per-leg', async () => {
      // Mark load as relay
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        loadNumber: 'ld-test-001',
        isRelay: true,
      });

      // Mock legs
      prisma.loadLeg.findMany.mockResolvedValue([
        {
          id: 1,
          legId: 'leg-1',
          sequence: 1,
          driver: { driverId: 'drv-1' },
          vehicle: { vehicleId: 'veh-1' },
          originStop: { sequenceOrder: 1 },
          destStop: { sequenceOrder: 2 },
        },
      ]);

      // Mock getStopsOutsideLeg
      prisma.loadStop.findMany.mockResolvedValue([]);

      // Setup the per-leg planRoute to succeed
      setupSuccessfulPlan();

      // Mock route plan lookup for linking
      prisma.routePlan.findUnique.mockResolvedValue({
        id: 1,
        planId: 'RP-TEST',
      });
      prisma.loadLeg.update.mockResolvedValue({});

      const result = await service.planRoute(baseRequest);

      expect(result).toHaveProperty('type', 'relay');
      expect((result as any).loadNumber).toBe('ld-test-001');
      expect((result as any).totalLegs).toBe(1);
    });

    it('should skip relay detection when _skipRelayDetection is set', async () => {
      setupSuccessfulPlan();

      const request = { ...baseRequest, _skipRelayDetection: true };
      const result = await service.planRoute(request);

      expect(result).not.toHaveProperty('type');
      // Should NOT call load.findFirst for relay check
      expect(prisma.load.findFirst).not.toHaveBeenCalled();
    });

    it('should skip relay detection for multi-load requests', async () => {
      setupSuccessfulPlan();

      const request = {
        ...baseRequest,
        loadIds: ['ld-test-001', 'ld-test-002'],
      };
      // Add second load
      prisma.load.findMany.mockResolvedValue([
        {
          id: 10,
          loadNumber: 'ld-test-001',
          stops: [
            {
              stop: {
                id: 1,
                stopId: 'stop-1',
                name: 'P1',
                lat: 32.78,
                lon: -96.8,
                timezone: 'America/Chicago',
              },
              actionType: 'pickup',
              sequenceOrder: 1,
            },
            {
              stop: {
                id: 2,
                stopId: 'stop-2',
                name: 'D1',
                lat: 33.75,
                lon: -84.39,
                timezone: 'America/New_York',
              },
              actionType: 'delivery',
              sequenceOrder: 2,
            },
          ],
        },
        {
          id: 11,
          loadNumber: 'ld-test-002',
          stops: [
            {
              stop: {
                id: 3,
                stopId: 'stop-3',
                name: 'P2',
                lat: 34.0,
                lon: -83.0,
                timezone: 'America/New_York',
              },
              actionType: 'pickup',
              sequenceOrder: 1,
            },
          ],
        },
      ]);

      const result = await service.planRoute(request);
      expect(result).not.toHaveProperty('type');
    });
  });

  // ─── Stops with missing coordinates ────────────────────────────────────

  describe('stops with missing coordinates', () => {
    it('should skip stops without lat/lon and warn', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      prisma.vehicle.findFirst.mockResolvedValue(makeVehicle());
      prisma.vehicleTelematics.findUnique.mockResolvedValue(null);
      prisma.integrationConfig.findFirst.mockResolvedValue(null);
      prisma.load.findMany.mockResolvedValue([
        {
          id: 10,
          loadNumber: 'ld-test-001',
          stops: [
            {
              stop: {
                id: 1,
                stopId: 'stop-1',
                name: 'Missing Coords',
                lat: null,
                lon: null,
              },
              actionType: 'pickup',
              sequenceOrder: 1,
            },
          ],
        },
      ]);

      await expect(service.planRoute(baseRequest)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Feasibility reporting ───────────────────────────────────────────────

  describe('feasibility', () => {
    it('should report infeasible when simulator returns issues', async () => {
      setupSuccessfulPlan();
      mockSimulator.simulate.mockResolvedValue({
        segments: [
          {
            segmentId: 'seg-1',
            sequenceOrder: 1,
            segmentType: 'drive',
            distanceMiles: 780,
            driveTimeHours: 12,
            estimatedArrival: new Date(),
            estimatedDeparture: new Date(),
          },
        ],
        totalDistanceMiles: 780,
        totalDriveTimeHours: 12,
        totalCostEstimate: 1200,
        dayCounter: 1,
        dailyBreakdown: [{ day: 1, onDutyHours: 12 }],
        feasibilityIssues: ['Exceeds 70-hour cycle limit'],
        complianceReport: { isCompliant: false },
        costBreakdown: {},
        weatherAlerts: [],
      });

      const result = (await service.planRoute(baseRequest)) as RoutePlanResult;

      expect(result.isFeasible).toBe(false);
      expect(result.feasibilityIssues).toContain('Exceeds 70-hour cycle limit');
    });
  });

  // buildAppointmentWindow moved to the shared pure helper appointment-window.ts
  // during the develop merge; its timezone / off-by-one / operating-hours
  // behaviors are covered in appointment-window.spec.ts.
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutePlanningEngineService, RoutePlanResult } from '../route-planning/services/route-planning-engine.service';
import { RoutePlanPersistenceService } from '../route-planning/services/route-plan-persistence.service';
import { HOSRuleEngineService } from '../hos-compliance/services/hos-rule-engine.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ROUTING_PROVIDER, RoutingProvider } from '../providers/routing/routing-provider.interface';
import { WEATHER_PROVIDER, WeatherProvider } from '../providers/weather/weather-provider.interface';
import { FUEL_DATA_PROVIDER, FuelDataProvider } from '../providers/fuel/fuel-data-provider.interface';
import { TOLL_PROVIDER } from '../providers/tolls/toll-provider.interface';
import { IntegrationDataService } from '../../integrations/services/integration-data.service';
import { OperationsSettingsService } from '../../platform/settings/operations-settings.service';
import { FuelCardsService } from '../../platform-services/fuel-cards/fuel-cards.service';
import { FuelPricingService } from '../providers/fuel/fuel-pricing.service';
import { RouteSimulator } from '../route-planning/services/route-simulator';

describe('RoutePlanningEngineService', () => {
  let service: RoutePlanningEngineService;

  // Mock implementations
  const mockPrismaService = {
    driver: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
    load: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
    },
    vehicleTelematics: {
      findUnique: jest.fn(),
    },
    integrationConfig: {
      findFirst: jest.fn(),
    },
  };

  const mockIntegrationData = {
    getDriverHOS: jest.fn(),
    getVehicleLocation: jest.fn(),
  };

  const mockOperationsSettingsService = {
    getSettings: jest.fn(),
  };

  const mockFuelCardsService = {
    getActiveCardTypes: jest.fn(),
    getBrandsAcceptingCards: jest.fn(),
  };

  const mockFuelPricingService = {
    getPriceForStop: jest.fn(),
    getPricesForStops: jest.fn(),
  };

  const mockRoutingProvider: RoutingProvider = {
    getDistanceMatrix: jest.fn(),
    getRoute: jest.fn(),
  };

  const mockWeatherProvider: WeatherProvider = {
    getWeatherAlongRoute: jest.fn(),
  };

  const mockFuelDataProvider: FuelDataProvider = {
    findFuelStopsNearPoint: jest.fn(),
    findFuelStopsAlongCorridor: jest.fn(),
  };

  const mockTollProvider = {
    estimateRouteToll: jest.fn().mockResolvedValue({ value: null, source: 'NOT_AVAILABLE' as const }),
  };

  const mockHOSRuleEngineService = {
    hoursUntilRestRequired: jest.fn(),
    simulateAfterDriving: jest.fn(),
    simulateAfterFullRest: jest.fn(),
    simulateAfter34hRestart: jest.fn(),
    simulateAfterSplitRest: jest.fn(),
    validateCompliance: jest.fn(),
    canDrive: jest.fn(),
    createInitialState: jest.fn(),
  };

  const mockRoutePlanPersistenceService = {
    createPlan: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockRouteSimulator = {
    simulate: jest.fn(),
    optimizeStopSequence: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutePlanningEngineService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ROUTING_PROVIDER,
          useValue: mockRoutingProvider,
        },
        {
          provide: WEATHER_PROVIDER,
          useValue: mockWeatherProvider,
        },
        {
          provide: FUEL_DATA_PROVIDER,
          useValue: mockFuelDataProvider,
        },
        {
          provide: TOLL_PROVIDER,
          useValue: mockTollProvider,
        },
        {
          provide: HOSRuleEngineService,
          useValue: mockHOSRuleEngineService,
        },
        {
          provide: RoutePlanPersistenceService,
          useValue: mockRoutePlanPersistenceService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: IntegrationDataService,
          useValue: mockIntegrationData,
        },
        {
          provide: OperationsSettingsService,
          useValue: mockOperationsSettingsService,
        },
        {
          provide: FuelCardsService,
          useValue: mockFuelCardsService,
        },
        {
          provide: FuelPricingService,
          useValue: mockFuelPricingService,
        },
        {
          provide: RouteSimulator,
          useValue: mockRouteSimulator,
        },
      ],
    }).compile();

    service = module.get<RoutePlanningEngineService>(RoutePlanningEngineService);

    // Reset all mocks
    jest.clearAllMocks();

    // Default config mock
    mockConfigService.get.mockReturnValue(10);

    // Default mocks for new V2 dependencies
    mockIntegrationData.getDriverHOS.mockResolvedValue(null); // Falls back to DB HOS
    mockIntegrationData.getVehicleLocation.mockResolvedValue(null);
    mockOperationsSettingsService.getSettings.mockResolvedValue(null); // Use defaults
    mockFuelCardsService.getActiveCardTypes.mockResolvedValue([]); // No fuel cards = accept all brands
    mockFuelCardsService.getBrandsAcceptingCards.mockResolvedValue([]);
    mockFuelPricingService.getPriceForStop.mockResolvedValue({
      pricePerGallon: 3.89,
      source: 'estimate',
    });
    mockPrismaService.vehicleTelematics.findUnique.mockResolvedValue(null); // No telematics = assume full tank
    mockPrismaService.integrationConfig.findFirst.mockResolvedValue(null); // No Samsara config

    // Default mock for simulator — returns a basic simulation result
    mockRouteSimulator.simulate.mockResolvedValue({
      segments: [
        {
          segmentId: 'seg-1',
          sequenceOrder: 1,
          segmentType: 'drive',
          fromLocation: 'Warehouse A',
          toLocation: 'Distribution Center B',
          fromLat: 41.8781,
          fromLon: -87.6298,
          toLat: 39.7392,
          toLon: -104.9903,
          distanceMiles: 200,
          driveTimeHours: 3.5,
          estimatedArrival: new Date('2026-02-07T11:30:00Z'),
          estimatedDeparture: new Date('2026-02-07T08:00:00Z'),
          hosStateAfter: {
            hoursDriven: 3.5,
            onDutyTime: 3.5,
            hoursSinceBreak: 3.5,
            drivingHoursSinceBreak: 3.5,
            cycleHoursUsed: 3.5,
            cycleDaysData: [],
          },
        },
        {
          segmentId: 'seg-2',
          sequenceOrder: 2,
          segmentType: 'dock',
          fromLocation: 'Warehouse A',
          toLocation: 'Warehouse A',
          fromLat: 41.8781,
          fromLon: -87.6298,
          toLat: 41.8781,
          toLon: -87.6298,
          dockDurationHours: 2,
          actionType: 'pickup',
          estimatedArrival: new Date('2026-02-07T11:30:00Z'),
          estimatedDeparture: new Date('2026-02-07T13:30:00Z'),
          hosStateAfter: {
            hoursDriven: 3.5,
            onDutyTime: 5.5,
            hoursSinceBreak: 5.5,
            drivingHoursSinceBreak: 5.5,
            cycleHoursUsed: 5.5,
            cycleDaysData: [],
          },
        },
      ],
      totalDistanceMiles: 200,
      totalDriveTimeHours: 3.5,
      totalCostEstimate: 0,
      dayCounter: 1,
      dailyBreakdown: [
        {
          day: 1,
          date: '2026-02-07',
          driveHours: 3.5,
          onDutyHours: 5.5,
          segments: 2,
          restStops: 0,
        },
      ],
      weatherAlerts: [],
      feasibilityIssues: [],
      complianceReport: {
        isFullyCompliant: true,
        totalRestStops: 0,
        totalBreaks: 0,
        total34hRestarts: 0,
        totalSplitRests: 0,
        dockTimeConversions: 0,
        rules: [
          { rule: '11-hour driving limit', status: 'pass' },
          { rule: '14-hour duty window', status: 'pass' },
          { rule: '30-minute break requirement', status: 'pass' },
          { rule: '10-hour off-duty rest', status: 'pass' },
          { rule: '70-hour/8-day cycle', status: 'pass' },
        ],
      },
      costBreakdown: {
        fuelCost: 0,
        laborCost: 87.5,
        tollCost: 0,
        totalOperatingCost: 87.5,
        costPerMile: 0.44,
        laborCostPerHour: 25,
      },
    });
  });

  describe('planRoute', () => {
    const mockDriver = {
      id: 1,
      driverId: 'drv-001',
      tenantId: 1,
      name: 'John Driver',
      currentHoursDriven: 0,
      currentOnDutyTime: 0,
      currentHoursSinceBreak: 0,
      cycleHoursUsed: 0,
      cycleDaysData: [],
      homeTerminalTimezone: 'America/Chicago',
    };

    const mockVehicle = {
      id: 1,
      vehicleId: 'veh-001',
      tenantId: 1,
      hasSleeperBerth: true,
      grossWeightLbs: 80000,
    };

    const mockLoads = [
      {
        id: 1,
        loadNumber: 'load-001',
        tenantId: 1,
        customerName: 'Test Customer A',
        stops: [
          {
            id: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
            earliestArrival: '08:00',
            latestArrival: '17:00',
            sequenceOrder: 1,
            stop: {
              id: 10,
              stopId: 'stop-pickup-001',
              name: 'Warehouse A',
              lat: 41.8781,
              lon: -87.6298,
              timezone: 'America/Chicago',
            },
          },
          {
            id: 2,
            actionType: 'delivery',
            estimatedDockHours: 1.5,
            earliestArrival: null,
            latestArrival: null,
            sequenceOrder: 2,
            stop: {
              id: 20,
              stopId: 'stop-delivery-001',
              name: 'Distribution Center B',
              lat: 39.7392,
              lon: -104.9903,
              timezone: 'America/Denver',
            },
          },
        ],
      },
    ];

    beforeEach(() => {
      // Default mocks for successful path
      mockPrismaService.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrismaService.vehicle.findFirst.mockResolvedValue(mockVehicle);
      // First call: with stops (for route planning)
      // Second call: just IDs (for persistence)
      mockPrismaService.load.findMany.mockResolvedValueOnce(mockLoads).mockResolvedValue([{ id: 1 }]);

      // Mock distance matrix - 200 miles, 3.5 hours between stops
      const distanceMatrix = new Map();
      distanceMatrix.set('origin:stop-pickup-001', {
        distanceMiles: 0,
        driveTimeHours: 0,
      });
      distanceMatrix.set('stop-pickup-001:stop-delivery-001', {
        distanceMiles: 200,
        driveTimeHours: 3.5,
      });
      (mockRoutingProvider.getDistanceMatrix as jest.Mock).mockResolvedValue(distanceMatrix);

      // Mock weather - clear conditions
      (mockWeatherProvider.getWeatherAlongRoute as jest.Mock).mockResolvedValue([]);

      // Mock fuel - no stops needed
      (mockFuelDataProvider.findFuelStopsAlongCorridor as jest.Mock).mockResolvedValue([]);

      // Mock HOS - plenty of hours remaining
      mockHOSRuleEngineService.hoursUntilRestRequired.mockReturnValue(11);
      mockHOSRuleEngineService.validateCompliance.mockReturnValue({
        isCompliant: true,
        hoursAvailableToDrive: 11,
        hoursUntilBreakRequired: 8,
        needsRestart: false,
        cycleHoursRemaining: 70,
      });
      mockHOSRuleEngineService.simulateAfterDriving.mockImplementation((state, driveHours, onDutyHours) => ({
        ...state,
        hoursDriven: (state.hoursDriven ?? 0) + driveHours,
        onDutyTime: (state.onDutyTime ?? 0) + Math.max(driveHours, onDutyHours),
        hoursSinceBreak: (state.hoursSinceBreak ?? 0) + Math.max(driveHours, onDutyHours),
        cycleHoursUsed: (state.cycleHoursUsed ?? 0) + Math.max(driveHours, onDutyHours),
      }));

      // Mock route geometry
      (mockRoutingProvider.getRoute as jest.Mock).mockResolvedValue({
        geometry: 'encoded-polyline-string',
        distanceMiles: 200,
        driveTimeHours: 3.5,
        waypoints: [],
      });

      // Mock persistence
      mockRoutePlanPersistenceService.createPlan.mockResolvedValue({
        id: 1,
        planId: 'RP-20260207-ABC123',
        status: 'DRAFT',
      });
    });

    it('should plan a short route with drive and dock segments', async () => {
      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      const result = (await service.planRoute(input)) as RoutePlanResult;

      // Verify driver, vehicle, and loads were resolved
      expect(mockPrismaService.driver.findFirst).toHaveBeenCalledWith({
        where: { driverId: 'drv-001', tenantId: 1 },
      });
      expect(mockPrismaService.vehicle.findFirst).toHaveBeenCalledWith({
        where: { vehicleId: 'veh-001', tenantId: 1 },
      });
      expect(mockPrismaService.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            loadNumber: { in: ['load-001'] },
            tenantId: 1,
          },
        }),
      );

      // Verify result structure
      expect(result.planId).toBeDefined();
      expect(result.isFeasible).toBe(true);
      expect(result.status).toBe('DRAFT');

      // Verify segments exist (drive to pickup, dock at pickup, drive to delivery, dock at delivery)
      expect(result.segments.length).toBeGreaterThan(0);

      // Should have drive segments
      const driveSegments = result.segments.filter((s) => s.segmentType === 'drive');
      expect(driveSegments.length).toBeGreaterThan(0);

      // Should have dock segments
      const dockSegments = result.segments.filter((s) => s.segmentType === 'dock');
      expect(dockSegments.length).toBeGreaterThan(0);

      // Total distance should be close to 200 miles
      expect(result.totalDistanceMiles).toBeGreaterThan(150);
      expect(result.totalDistanceMiles).toBeLessThan(250);

      // Should be feasible
      expect(result.feasibilityIssues.length).toBe(0);

      // Verify simulator was called
      expect(mockRouteSimulator.simulate).toHaveBeenCalled();

      // Verify persistence was called
      expect(mockRoutePlanPersistenceService.createPlan).toHaveBeenCalled();
    });

    it('should insert rest stop when HOS hours are insufficient for leg', async () => {
      // Mock simulator to return result with rest segment
      mockRouteSimulator.simulate.mockResolvedValue({
        segments: [
          {
            segmentId: 'seg-1',
            sequenceOrder: 1,
            segmentType: 'rest',
            fromLocation: 'Warehouse A',
            toLocation: 'Warehouse A',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 41.8781,
            toLon: -87.6298,
            restDurationHours: 10,
            restType: 'full_rest',
            restReason: 'HOS daily limit reached',
            estimatedArrival: new Date('2026-02-07T08:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T18:00:00Z'),
            hosStateAfter: {
              hoursDriven: 0,
              onDutyTime: 0,
              hoursSinceBreak: 0,
              drivingHoursSinceBreak: 0,
              cycleHoursUsed: 10,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-2',
            sequenceOrder: 2,
            segmentType: 'drive',
            fromLocation: 'Warehouse A',
            toLocation: 'Distribution Center B',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 39.7392,
            toLon: -104.9903,
            distanceMiles: 200,
            driveTimeHours: 3.5,
            estimatedArrival: new Date('2026-02-07T21:30:00Z'),
            estimatedDeparture: new Date('2026-02-07T18:00:00Z'),
            hosStateAfter: {
              hoursDriven: 3.5,
              onDutyTime: 3.5,
              hoursSinceBreak: 3.5,
              drivingHoursSinceBreak: 3.5,
              cycleHoursUsed: 13.5,
              cycleDaysData: [],
            },
          },
        ],
        totalDistanceMiles: 200,
        totalDriveTimeHours: 3.5,
        totalCostEstimate: 0,
        dayCounter: 1,
        dailyBreakdown: [
          {
            day: 1,
            date: '2026-02-07',
            driveHours: 3.5,
            onDutyHours: 3.5,
            segments: 2,
            restStops: 1,
          },
        ],
        weatherAlerts: [],
        feasibilityIssues: [],
        complianceReport: {
          isFullyCompliant: true,
          totalRestStops: 1,
          totalBreaks: 0,
          total34hRestarts: 0,
          totalSplitRests: 0,
          dockTimeConversions: 0,
          rules: [
            { rule: '11-hour driving limit', status: 'pass' },
            { rule: '14-hour duty window', status: 'pass' },
            { rule: '30-minute break requirement', status: 'pass' },
            { rule: '10-hour off-duty rest', status: 'addressed' },
            { rule: '70-hour/8-day cycle', status: 'pass' },
          ],
        },
        costBreakdown: {
          fuelCost: 0,
          laborCost: 87.5,
          tollCost: 0,
          totalOperatingCost: 87.5,
          costPerMile: 0.44,
          laborCostPerHour: 25,
        },
      });

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      const result = (await service.planRoute(input)) as RoutePlanResult;

      // Should have rest segment(s)
      const restSegments = result.segments.filter((s) => s.segmentType === 'rest');
      expect(restSegments.length).toBeGreaterThan(0);

      // Should still be feasible
      expect(result.isFeasible).toBe(true);
    });

    it('should insert fuel stop when tank runs low', async () => {
      // Mock simulator to return result with fuel segment
      mockRouteSimulator.simulate.mockResolvedValue({
        segments: [
          {
            segmentId: 'seg-1',
            sequenceOrder: 1,
            segmentType: 'fuel',
            fromLocation: 'Warehouse A',
            toLocation: 'Truck Stop A',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 38.0,
            toLon: -100.0,
            fuelGallons: 250,
            fuelCostEstimate: 950,
            fuelStationName: 'Truck Stop A',
            fuelPricePerGallon: 3.8,
            detourMiles: 2,
            estimatedArrival: new Date('2026-02-07T08:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T08:30:00Z'),
            hosStateAfter: {
              hoursDriven: 0,
              onDutyTime: 0.5,
              hoursSinceBreak: 0.5,
              drivingHoursSinceBreak: 0.5,
              cycleHoursUsed: 0.5,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-2',
            sequenceOrder: 2,
            segmentType: 'drive',
            fromLocation: 'Truck Stop A',
            toLocation: 'Distribution Center B',
            fromLat: 38.0,
            fromLon: -100.0,
            toLat: 34.0522,
            toLon: -118.2437,
            distanceMiles: 1800,
            driveTimeHours: 28,
            estimatedArrival: new Date('2026-02-08T12:30:00Z'),
            estimatedDeparture: new Date('2026-02-07T08:30:00Z'),
            hosStateAfter: {
              hoursDriven: 28,
              onDutyTime: 28.5,
              hoursSinceBreak: 28.5,
              drivingHoursSinceBreak: 28.5,
              cycleHoursUsed: 28.5,
              cycleDaysData: [],
            },
          },
        ],
        totalDistanceMiles: 1800,
        totalDriveTimeHours: 28,
        totalCostEstimate: 950,
        dayCounter: 2,
        dailyBreakdown: [
          {
            day: 1,
            date: '2026-02-07',
            driveHours: 16,
            onDutyHours: 16.5,
            segments: 2,
            restStops: 0,
          },
        ],
        weatherAlerts: [],
        feasibilityIssues: [],
        complianceReport: {
          isFullyCompliant: true,
          totalRestStops: 0,
          totalBreaks: 0,
          total34hRestarts: 0,
          totalSplitRests: 0,
          dockTimeConversions: 0,
          rules: [
            { rule: '11-hour driving limit', status: 'pass' },
            { rule: '14-hour duty window', status: 'pass' },
            { rule: '30-minute break requirement', status: 'pass' },
            { rule: '10-hour off-duty rest', status: 'pass' },
            { rule: '70-hour/8-day cycle', status: 'pass' },
          ],
        },
        costBreakdown: {
          fuelCost: 950,
          laborCost: 700,
          tollCost: 0,
          totalOperatingCost: 1650,
          costPerMile: 0.92,
          laborCostPerHour: 25,
        },
      });

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      const result = (await service.planRoute(input)) as RoutePlanResult;

      // Should have fuel segment(s)
      const fuelSegments = result.segments.filter((s) => s.segmentType === 'fuel');
      expect(fuelSegments.length).toBeGreaterThan(0);

      // Fuel segment should have fuel details
      const fuelSegment = fuelSegments[0];
      expect(fuelSegment.fuelGallons).toBeDefined();
      expect(fuelSegment.fuelCostEstimate).toBeDefined();
      expect(fuelSegment.fuelStationName).toBe('Truck Stop A');
    });

    it('should throw BadRequestException when driver not found', async () => {
      // Mock driver not found
      mockPrismaService.driver.findFirst.mockResolvedValue(null);

      const input = {
        driverId: 'drv-999',
        vehicleId: 'veh-001',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      await expect(service.planRoute(input)).rejects.toThrow(BadRequestException);
      await expect(service.planRoute(input)).rejects.toThrow('Driver not found: drv-999');
    });

    it('should throw BadRequestException when vehicle not found', async () => {
      // Mock vehicle not found
      mockPrismaService.vehicle.findFirst.mockResolvedValue(null);

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-999',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      await expect(service.planRoute(input)).rejects.toThrow(BadRequestException);
      await expect(service.planRoute(input)).rejects.toThrow('Vehicle not found: veh-999');
    });

    it('should throw BadRequestException when loads not found', async () => {
      // Mock loads not found - need to reset the mock from beforeEach
      mockPrismaService.load.findMany.mockReset();
      mockPrismaService.load.findMany.mockResolvedValue([]);

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-999'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      await expect(service.planRoute(input)).rejects.toThrow(BadRequestException);
      await expect(service.planRoute(input)).rejects.toThrow('Loads not found: load-999');
    });

    it('should throw BadRequestException when no stops found for loads', async () => {
      // Mock loads with no stops
      const emptyStopsLoads = [
        {
          id: 1,
          loadNumber: 'load-001',
          tenantId: 1,
          customerName: 'Test Customer A',
          stops: [], // No stops
        },
      ];

      mockPrismaService.load.findMany.mockReset();
      mockPrismaService.load.findMany.mockResolvedValue(emptyStopsLoads);

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      await expect(service.planRoute(input)).rejects.toThrow(BadRequestException);
      await expect(service.planRoute(input)).rejects.toThrow('No stops found for the provided load IDs');
    });

    it('should handle 34h restart when cycle hours are exhausted', async () => {
      // Mock simulator to return result with 34h restart segment
      mockRouteSimulator.simulate.mockResolvedValue({
        segments: [
          {
            segmentId: 'seg-1',
            sequenceOrder: 1,
            segmentType: 'rest',
            fromLocation: 'Warehouse A',
            toLocation: 'Warehouse A',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 41.8781,
            toLon: -87.6298,
            restDurationHours: 34,
            restType: 'restart_34h',
            restReason: '70-hour cycle limit reached',
            estimatedArrival: new Date('2026-02-07T08:00:00Z'),
            estimatedDeparture: new Date('2026-02-08T18:00:00Z'),
            hosStateAfter: {
              hoursDriven: 0,
              onDutyTime: 0,
              hoursSinceBreak: 0,
              drivingHoursSinceBreak: 0,
              cycleHoursUsed: 0,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-2',
            sequenceOrder: 2,
            segmentType: 'drive',
            fromLocation: 'Warehouse A',
            toLocation: 'Distribution Center B',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 39.7392,
            toLon: -104.9903,
            distanceMiles: 200,
            driveTimeHours: 3.5,
            estimatedArrival: new Date('2026-02-08T21:30:00Z'),
            estimatedDeparture: new Date('2026-02-08T18:00:00Z'),
            hosStateAfter: {
              hoursDriven: 3.5,
              onDutyTime: 3.5,
              hoursSinceBreak: 3.5,
              drivingHoursSinceBreak: 3.5,
              cycleHoursUsed: 3.5,
              cycleDaysData: [],
            },
          },
        ],
        totalDistanceMiles: 200,
        totalDriveTimeHours: 3.5,
        totalCostEstimate: 0,
        dayCounter: 2,
        dailyBreakdown: [
          {
            day: 1,
            date: '2026-02-07',
            driveHours: 0,
            onDutyHours: 0,
            segments: 1,
            restStops: 1,
          },
          {
            day: 2,
            date: '2026-02-08',
            driveHours: 3.5,
            onDutyHours: 3.5,
            segments: 1,
            restStops: 0,
          },
        ],
        weatherAlerts: [],
        feasibilityIssues: [],
        complianceReport: {
          isFullyCompliant: true,
          totalRestStops: 1,
          totalBreaks: 0,
          total34hRestarts: 1,
          totalSplitRests: 0,
          dockTimeConversions: 0,
          rules: [
            { rule: '11-hour driving limit', status: 'pass' },
            { rule: '14-hour duty window', status: 'pass' },
            { rule: '30-minute break requirement', status: 'pass' },
            { rule: '10-hour off-duty rest', status: 'addressed' },
            { rule: '70-hour/8-day cycle', status: 'addressed' },
          ],
        },
        costBreakdown: {
          fuelCost: 0,
          laborCost: 87.5,
          tollCost: 0,
          totalOperatingCost: 87.5,
          costPerMile: 0.44,
          laborCostPerHour: 25,
        },
      });

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      const result = (await service.planRoute(input)) as RoutePlanResult;

      // Should have rest segment with restart_34h type
      const restartSegments = result.segments.filter((s) => s.segmentType === 'rest' && s.restType === 'restart_34h');
      expect(restartSegments.length).toBeGreaterThan(0);

      // Compliance report should reflect the restart
      expect(result.complianceReport.total34hRestarts).toBeGreaterThan(0);
    });

    it('should handle 30-minute break when required', async () => {
      // Mock simulator to return result with break segment
      mockRouteSimulator.simulate.mockResolvedValue({
        segments: [
          {
            segmentId: 'seg-1',
            sequenceOrder: 1,
            segmentType: 'break',
            fromLocation: 'Warehouse A',
            toLocation: 'Warehouse A',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 41.8781,
            toLon: -87.6298,
            restDurationHours: 0.5,
            restType: 'mandatory_break',
            restReason: '30-minute break required after 8 hours on-duty',
            estimatedArrival: new Date('2026-02-07T08:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T08:30:00Z'),
            hosStateAfter: {
              hoursDriven: 0,
              onDutyTime: 0,
              hoursSinceBreak: 0,
              drivingHoursSinceBreak: 0,
              cycleHoursUsed: 0,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-2',
            sequenceOrder: 2,
            segmentType: 'drive',
            fromLocation: 'Warehouse A',
            toLocation: 'Distribution Center B',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 39.7392,
            toLon: -104.9903,
            distanceMiles: 200,
            driveTimeHours: 3.5,
            estimatedArrival: new Date('2026-02-07T12:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T08:30:00Z'),
            hosStateAfter: {
              hoursDriven: 3.5,
              onDutyTime: 3.5,
              hoursSinceBreak: 3.5,
              drivingHoursSinceBreak: 3.5,
              cycleHoursUsed: 3.5,
              cycleDaysData: [],
            },
          },
        ],
        totalDistanceMiles: 200,
        totalDriveTimeHours: 3.5,
        totalCostEstimate: 0,
        dayCounter: 1,
        dailyBreakdown: [
          {
            day: 1,
            date: '2026-02-07',
            driveHours: 3.5,
            onDutyHours: 3.5,
            segments: 2,
            restStops: 0,
          },
        ],
        weatherAlerts: [],
        feasibilityIssues: [],
        complianceReport: {
          isFullyCompliant: true,
          totalRestStops: 0,
          totalBreaks: 1,
          total34hRestarts: 0,
          totalSplitRests: 0,
          dockTimeConversions: 0,
          rules: [
            { rule: '11-hour driving limit', status: 'pass' },
            { rule: '14-hour duty window', status: 'pass' },
            { rule: '30-minute break requirement', status: 'addressed' },
            { rule: '10-hour off-duty rest', status: 'pass' },
            { rule: '70-hour/8-day cycle', status: 'pass' },
          ],
        },
        costBreakdown: {
          fuelCost: 0,
          laborCost: 87.5,
          tollCost: 0,
          totalOperatingCost: 87.5,
          costPerMile: 0.44,
          laborCostPerHour: 25,
        },
      });

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-001'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      const result = (await service.planRoute(input)) as RoutePlanResult;

      // Should complete successfully
      expect(result.planId).toBeDefined();

      // Should have break segment
      const breakSegments = result.segments.filter((s) => s.segmentType === 'break');
      expect(breakSegments.length).toBeGreaterThan(0);
      expect(breakSegments[0].restType).toBe('mandatory_break');
      expect(breakSegments[0].restDurationHours).toBe(0.5);
    });

    it('should handle multiple loads with multiple stops', async () => {
      // Mock simulator to return 4 dock segments for 4 stops
      mockRouteSimulator.simulate.mockResolvedValue({
        segments: [
          {
            segmentId: 'seg-1',
            sequenceOrder: 1,
            segmentType: 'dock',
            fromLocation: 'Warehouse A',
            toLocation: 'Warehouse A',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 41.8781,
            toLon: -87.6298,
            dockDurationHours: 2,
            actionType: 'pickup',
            estimatedArrival: new Date('2026-02-07T08:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T10:00:00Z'),
            hosStateAfter: {
              hoursDriven: 0,
              onDutyTime: 2,
              hoursSinceBreak: 2,
              drivingHoursSinceBreak: 2,
              cycleHoursUsed: 2,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-2',
            sequenceOrder: 2,
            segmentType: 'drive',
            fromLocation: 'Warehouse A',
            toLocation: 'Warehouse C',
            fromLat: 41.8781,
            fromLon: -87.6298,
            toLat: 40.7128,
            toLon: -74.006,
            distanceMiles: 100,
            driveTimeHours: 2,
            estimatedArrival: new Date('2026-02-07T12:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T10:00:00Z'),
            hosStateAfter: {
              hoursDriven: 2,
              onDutyTime: 4,
              hoursSinceBreak: 4,
              drivingHoursSinceBreak: 4,
              cycleHoursUsed: 4,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-3',
            sequenceOrder: 3,
            segmentType: 'dock',
            fromLocation: 'Warehouse C',
            toLocation: 'Warehouse C',
            fromLat: 40.7128,
            fromLon: -74.006,
            toLat: 40.7128,
            toLon: -74.006,
            dockDurationHours: 1,
            actionType: 'pickup',
            estimatedArrival: new Date('2026-02-07T12:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T13:00:00Z'),
            hosStateAfter: {
              hoursDriven: 2,
              onDutyTime: 5,
              hoursSinceBreak: 5,
              drivingHoursSinceBreak: 5,
              cycleHoursUsed: 5,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-4',
            sequenceOrder: 4,
            segmentType: 'drive',
            fromLocation: 'Warehouse C',
            toLocation: 'Distribution Center D',
            fromLat: 40.7128,
            fromLon: -74.006,
            toLat: 42.3601,
            toLon: -71.0589,
            distanceMiles: 50,
            driveTimeHours: 1,
            estimatedArrival: new Date('2026-02-07T14:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T13:00:00Z'),
            hosStateAfter: {
              hoursDriven: 3,
              onDutyTime: 6,
              hoursSinceBreak: 6,
              drivingHoursSinceBreak: 6,
              cycleHoursUsed: 6,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-5',
            sequenceOrder: 5,
            segmentType: 'dock',
            fromLocation: 'Distribution Center D',
            toLocation: 'Distribution Center D',
            fromLat: 42.3601,
            fromLon: -71.0589,
            toLat: 42.3601,
            toLon: -71.0589,
            dockDurationHours: 2,
            actionType: 'delivery',
            estimatedArrival: new Date('2026-02-07T14:00:00Z'),
            estimatedDeparture: new Date('2026-02-07T16:00:00Z'),
            hosStateAfter: {
              hoursDriven: 3,
              onDutyTime: 8,
              hoursSinceBreak: 8,
              drivingHoursSinceBreak: 8,
              cycleHoursUsed: 8,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-6',
            sequenceOrder: 6,
            segmentType: 'drive',
            fromLocation: 'Distribution Center D',
            toLocation: 'Distribution Center B',
            fromLat: 42.3601,
            fromLon: -71.0589,
            toLat: 39.7392,
            toLon: -104.9903,
            distanceMiles: 200,
            driveTimeHours: 3.5,
            estimatedArrival: new Date('2026-02-07T19:30:00Z'),
            estimatedDeparture: new Date('2026-02-07T16:00:00Z'),
            hosStateAfter: {
              hoursDriven: 6.5,
              onDutyTime: 11.5,
              hoursSinceBreak: 11.5,
              drivingHoursSinceBreak: 11.5,
              cycleHoursUsed: 11.5,
              cycleDaysData: [],
            },
          },
          {
            segmentId: 'seg-7',
            sequenceOrder: 7,
            segmentType: 'dock',
            fromLocation: 'Distribution Center B',
            toLocation: 'Distribution Center B',
            fromLat: 39.7392,
            fromLon: -104.9903,
            toLat: 39.7392,
            toLon: -104.9903,
            dockDurationHours: 1.5,
            actionType: 'delivery',
            estimatedArrival: new Date('2026-02-07T19:30:00Z'),
            estimatedDeparture: new Date('2026-02-07T21:00:00Z'),
            hosStateAfter: {
              hoursDriven: 6.5,
              onDutyTime: 13,
              hoursSinceBreak: 13,
              drivingHoursSinceBreak: 13,
              cycleHoursUsed: 13,
              cycleDaysData: [],
            },
          },
        ],
        totalDistanceMiles: 350,
        totalDriveTimeHours: 6.5,
        totalCostEstimate: 0,
        dayCounter: 1,
        dailyBreakdown: [
          {
            day: 1,
            date: '2026-02-07',
            driveHours: 6.5,
            onDutyHours: 13,
            segments: 7,
            restStops: 0,
          },
        ],
        weatherAlerts: [],
        feasibilityIssues: [],
        complianceReport: {
          isFullyCompliant: true,
          totalRestStops: 0,
          totalBreaks: 0,
          total34hRestarts: 0,
          totalSplitRests: 0,
          dockTimeConversions: 0,
          rules: [
            { rule: '11-hour driving limit', status: 'pass' },
            { rule: '14-hour duty window', status: 'pass' },
            { rule: '30-minute break requirement', status: 'pass' },
            { rule: '10-hour off-duty rest', status: 'pass' },
            { rule: '70-hour/8-day cycle', status: 'pass' },
          ],
        },
        costBreakdown: {
          fuelCost: 0,
          laborCost: 162.5,
          tollCost: 0,
          totalOperatingCost: 162.5,
          costPerMile: 0.46,
          laborCostPerHour: 25,
        },
      });

      // Create multiple loads with multiple stops
      const multipleLoads = [
        {
          id: 1,
          loadNumber: 'load-001',
          tenantId: 1,
          customerName: 'Customer A',
          stops: [
            {
              id: 1,
              actionType: 'pickup',
              estimatedDockHours: 2,
              earliestArrival: '08:00',
              latestArrival: '17:00',
              sequenceOrder: 1,
              stop: {
                id: 10,
                stopId: 'stop-pickup-001',
                name: 'Warehouse A',
                lat: 41.8781,
                lon: -87.6298,
                timezone: 'America/Chicago',
              },
            },
            {
              id: 2,
              actionType: 'delivery',
              estimatedDockHours: 1.5,
              earliestArrival: null,
              latestArrival: null,
              sequenceOrder: 2,
              stop: {
                id: 20,
                stopId: 'stop-delivery-001',
                name: 'Distribution Center B',
                lat: 39.7392,
                lon: -104.9903,
                timezone: 'America/Denver',
              },
            },
          ],
        },
        {
          id: 2,
          loadNumber: 'load-002',
          tenantId: 1,
          customerName: 'Customer B',
          stops: [
            {
              id: 3,
              actionType: 'pickup',
              estimatedDockHours: 1,
              earliestArrival: null,
              latestArrival: null,
              sequenceOrder: 1,
              stop: {
                id: 30,
                stopId: 'stop-pickup-002',
                name: 'Warehouse C',
                lat: 40.7128,
                lon: -74.006,
                timezone: 'America/New_York',
              },
            },
            {
              id: 4,
              actionType: 'delivery',
              estimatedDockHours: 2,
              earliestArrival: null,
              latestArrival: null,
              sequenceOrder: 2,
              stop: {
                id: 40,
                stopId: 'stop-delivery-002',
                name: 'Distribution Center D',
                lat: 42.3601,
                lon: -71.0589,
                timezone: 'America/New_York',
              },
            },
          ],
        },
      ];

      // Reset and set up mocks for multiple loads
      mockPrismaService.load.findMany.mockReset();
      mockPrismaService.load.findMany.mockResolvedValueOnce(multipleLoads).mockResolvedValue([{ id: 1 }, { id: 2 }]);

      // Mock distance matrix for all combinations (need all permutations)
      const distanceMatrix = new Map();
      distanceMatrix.set('origin:stop-pickup-001', {
        distanceMiles: 0,
        driveTimeHours: 0,
      });
      distanceMatrix.set('origin:stop-pickup-002', {
        distanceMiles: 50,
        driveTimeHours: 1,
      });
      distanceMatrix.set('origin:stop-delivery-001', {
        distanceMiles: 200,
        driveTimeHours: 3.5,
      });
      distanceMatrix.set('origin:stop-delivery-002', {
        distanceMiles: 150,
        driveTimeHours: 2.5,
      });
      distanceMatrix.set('stop-pickup-001:stop-delivery-001', {
        distanceMiles: 200,
        driveTimeHours: 3.5,
      });
      distanceMatrix.set('stop-pickup-001:stop-pickup-002', {
        distanceMiles: 100,
        driveTimeHours: 2,
      });
      distanceMatrix.set('stop-pickup-001:stop-delivery-002', {
        distanceMiles: 150,
        driveTimeHours: 2.5,
      });
      distanceMatrix.set('stop-pickup-002:stop-delivery-001', {
        distanceMiles: 250,
        driveTimeHours: 4,
      });
      distanceMatrix.set('stop-pickup-002:stop-delivery-002', {
        distanceMiles: 50,
        driveTimeHours: 1,
      });
      distanceMatrix.set('stop-delivery-001:stop-pickup-002', {
        distanceMiles: 250,
        driveTimeHours: 4,
      });
      distanceMatrix.set('stop-delivery-001:stop-delivery-002', {
        distanceMiles: 300,
        driveTimeHours: 5,
      });
      distanceMatrix.set('stop-delivery-002:stop-delivery-001', {
        distanceMiles: 300,
        driveTimeHours: 5,
      });
      (mockRoutingProvider.getDistanceMatrix as jest.Mock).mockResolvedValue(distanceMatrix);

      const input = {
        driverId: 'drv-001',
        vehicleId: 'veh-001',
        loadIds: ['load-001', 'load-002'],
        departureTime: new Date('2026-02-07T08:00:00Z'),
        tenantId: 1,
      };

      const result = (await service.planRoute(input)) as RoutePlanResult;

      // Should handle multiple loads successfully
      expect(result.planId).toBeDefined();
      expect(result.isFeasible).toBe(true);

      // Should have segments for all stops (4 pickup/delivery stops)
      const dockSegments = result.segments.filter((s) => s.segmentType === 'dock');
      expect(dockSegments.length).toBe(4); // 2 pickups + 2 deliveries

      // Verify load resolution was called with both load IDs
      expect(mockPrismaService.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            loadNumber: { in: ['load-001', 'load-002'] },
            tenantId: 1,
          },
        }),
      );
    });
  });
});

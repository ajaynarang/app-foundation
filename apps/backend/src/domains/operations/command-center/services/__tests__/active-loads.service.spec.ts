import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LoadStatus, LoadStopStatus, RouteSegmentStatus } from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { IntegrationDataService } from '../../../../integrations/services/integration-data.service';
import { EtaCalculatorService } from '../../../monitoring/services/eta-calculator.service';
import { ActiveLoadsService } from '../active-loads.service';

describe('ActiveLoadsService', () => {
  let service: ActiveLoadsService;

  const mockCache = {
    getOrSet: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
  };

  const mockPrisma = {
    load: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  // GPS + ETA collaborators. Defaults: no GPS ping, no drive estimate — the
  // honest "no signal" baseline. Individual tests opt into real values.
  const mockIntegrationData = {
    getVehicleLocation: jest.fn().mockResolvedValue(null),
  };

  const mockEtaCalculator = {
    getEstimatedDriveMinutes: jest.fn().mockResolvedValue(null),
  };

  const now = new Date('2026-05-15T12:00:00.000Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    // mockReset (not clearAllMocks) — also drains any unconsumed
    // mockResolvedValueOnce queue so per-test stubs never bleed across tests.
    mockCache.getOrSet.mockReset().mockImplementation((_key: string, fn: () => any) => fn());
    mockPrisma.load.findMany.mockReset().mockResolvedValue([]);
    mockIntegrationData.getVehicleLocation.mockReset().mockResolvedValue(null);
    mockEtaCalculator.getEstimatedDriveMinutes.mockReset().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveLoadsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SallyCacheService, useValue: mockCache },
        { provide: IntegrationDataService, useValue: mockIntegrationData },
        { provide: EtaCalculatorService, useValue: mockEtaCalculator },
      ],
    }).compile();

    service = module.get(ActiveLoadsService);
  });

  const inTransitLoad = (overrides: Record<string, any> = {}) => ({
    id: 1,
    loadNumber: 'LD-20260515-001',
    referenceNumber: 'PO-4427',
    status: LoadStatus.IN_TRANSIT,
    customerName: 'Acme Co',
    customerId: 10,
    tenantId: 1,
    driver: {
      id: 100,
      driverId: 'DRV-001',
      name: 'Hector Velez',
      hosData: {
        driveTimeRemainingMs: 2 * 3600_000,
        shiftTimeRemainingMs: 5 * 3600_000,
        cycleTimeRemainingMs: 40 * 3600_000,
        timeUntilBreakMs: 90 * 60_000,
      },
      hosDataSyncedAt: new Date('2026-05-15T11:55:00.000Z'),
    },
    vehicle: { id: 5, vehicleId: 'VEH-005', unitNumber: 'T-07' },
    stops: [
      {
        id: 1,
        stopId: 1,
        sequenceOrder: 1,
        actionType: 'pickup',
        status: LoadStopStatus.COMPLETED,
        appointmentDate: null,
        earliestArrival: null,
        latestArrival: null,
        arrivedAt: new Date('2026-05-15T10:00:00.000Z'),
        completedAt: new Date('2026-05-15T11:00:00.000Z'),
        departedAt: new Date('2026-05-15T11:05:00.000Z'),
        stop: { stopId: 'STP-001', name: 'Origin', city: 'Chicago', state: 'IL', lat: 41.85, lon: -87.65 },
      },
      {
        id: 2,
        stopId: 2,
        sequenceOrder: 2,
        actionType: 'delivery',
        status: LoadStopStatus.PENDING,
        appointmentDate: new Date('2026-05-15'),
        earliestArrival: '13:00',
        latestArrival: '13:30',
        arrivedAt: null,
        completedAt: null,
        departedAt: null,
        stop: { stopId: 'STP-002', name: 'Dest', city: 'Dallas', state: 'TX', lat: 32.78, lon: -96.8 },
      },
    ],
    integrationConfig: null,
    ...overrides,
  });

  const assignedRollingLoad = (overrides: Record<string, any> = {}) => ({
    id: 2,
    loadNumber: 'LD-20260515-002',
    status: LoadStatus.ASSIGNED,
    customerName: 'Beta Inc',
    customerId: 11,
    tenantId: 1,
    driver: {
      id: 101,
      driverId: 'DRV-002',
      name: 'Linda Park',
      hosData: { driveTimeRemainingMs: 6 * 3600_000 },
      hosDataSyncedAt: new Date('2026-05-15T11:50:00.000Z'),
    },
    vehicle: { id: 6, vehicleId: 'VEH-006', unitNumber: 'T-12' },
    stops: [
      {
        id: 3,
        stopId: 3,
        sequenceOrder: 1,
        actionType: 'pickup',
        status: LoadStopStatus.PENDING,
        appointmentDate: new Date('2026-05-15'),
        earliestArrival: '14:30',
        latestArrival: '15:00',
        arrivedAt: null,
        completedAt: null,
        departedAt: null,
        stop: { stopId: 'STP-003', name: 'Pickup', city: 'Atlanta', state: 'GA', lat: 33.75, lon: -84.39 },
      },
    ],
    ...overrides,
  });

  // An IN_TRANSIT load whose active route plan puts the truck at the next
  // (delivery) stop at 13:15 — 15 min before the 13:30 appointment.
  const routePlannedLoad = (overrides: Record<string, any> = {}) => {
    const load = inTransitLoad();
    return {
      ...load,
      routePlanLoads: [
        {
          plan: {
            estimatedArrival: new Date('2026-05-15T14:00:00.000Z'),
            segments: [
              {
                sequenceOrder: 1,
                segmentType: 'dock',
                status: RouteSegmentStatus.COMPLETED,
                estimatedArrival: new Date('2026-05-15T10:00:00.000Z'),
                updatedEta: null,
              },
              {
                sequenceOrder: 2,
                segmentType: 'dock',
                status: RouteSegmentStatus.PLANNED,
                estimatedArrival: new Date('2026-05-15T13:15:00.000Z'),
                updatedEta: null,
              },
            ],
          },
        },
      ],
      ...overrides,
    };
  };

  it('returns drivers with IN_TRANSIT loads', async () => {
    mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);

    const result = await service.findActiveLoads(1, 4);

    expect(result).toHaveLength(1);
    expect(result[0].loadId).toBe('LD-20260515-001');
    expect(result[0].loadNumber).toBe('LD-20260515-001');
    expect(result[0].referenceNumber).toBe('PO-4427');
    expect(result[0].assignmentState).toBe('assigned');
    expect(result[0].driver.driverId).toBe('DRV-001');
    expect(result[0].driver.name).toBe('Hector Velez');
    expect(result[0].driver.initials).toBe('HV');
    expect(result[0].vehicleIdentifier).toBe('T-07');
  });

  it('returns ASSIGNED loads inside lookahead window as rolling', async () => {
    mockPrisma.load.findMany.mockResolvedValueOnce([assignedRollingLoad()]);

    const result = await service.findActiveLoads(1, 4);

    expect(result).toHaveLength(1);
    expect(result[0].loadId).toBe('LD-20260515-002');
    expect(result[0].loadNumber).toBe('LD-20260515-002');
    expect(result[0].referenceNumber).toBeNull();
    expect(result[0].assignmentState).toBe('rolling');
  });

  it('excludes ASSIGNED loads outside lookahead window', async () => {
    // Pickup at 14:30 same day, but lookahead = 1h from 12:00 → cutoff 13:00
    mockPrisma.load.findMany.mockResolvedValueOnce([assignedRollingLoad()]);

    const result = await service.findActiveLoads(1, 1);

    expect(result).toHaveLength(0);
  });

  it('excludes off-shift drivers with no active load', async () => {
    // Driver with no active load means findMany returns nothing for that driver
    mockPrisma.load.findMany.mockResolvedValueOnce([]);

    const result = await service.findActiveLoads(1, 4);

    expect(result).toEqual([]);
  });

  it('scopes every query by tenantId', async () => {
    await service.findActiveLoads(42, 4);

    expect(mockPrisma.load.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 42 }),
      }),
    );
  });

  it('rejects lookaheadHours outside [1, 12] with BadRequestException', async () => {
    await expect(service.findActiveLoads(1, 0)).rejects.toThrow(BadRequestException);
    await expect(service.findActiveLoads(1, 13)).rejects.toThrow(BadRequestException);
  });

  it('hits cache on the second call', async () => {
    mockPrisma.load.findMany.mockResolvedValue([inTransitLoad()]);

    const first = await service.findActiveLoads(1, 4);

    mockCache.getOrSet.mockResolvedValueOnce(first);

    await service.findActiveLoads(1, 4);

    // First call computed, second call resolved from cache mock → only one factory invocation
    expect(mockPrisma.load.findMany).toHaveBeenCalledTimes(1);
  });

  it('normalizes all four HOS clocks to minutes and exposes ELD status', async () => {
    mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);

    const result = await service.findActiveLoads(1, 4);

    expect(result[0].hos?.driveMinutesRemaining).toBe(120);
    expect(result[0].hos?.dutyMinutesRemaining).toBe(300);
    expect(result[0].hos?.cycleMinutesRemaining).toBe(2400);
    expect(result[0].hos?.breakMinutesRemaining).toBe(90);
    expect(result[0].hos?.isEldConnected).toBe(true);
    expect(result[0].hos?.lastSyncAt).toBe('2026-05-15T11:55:00.000Z');
  });

  it('defaults missing duty/cycle clocks to 0 and break to null', async () => {
    // assignedRollingLoad()'s driver carries only driveTimeRemainingMs.
    mockPrisma.load.findMany.mockResolvedValueOnce([assignedRollingLoad()]);

    const result = await service.findActiveLoads(1, 4);

    expect(result[0].hos?.driveMinutesRemaining).toBe(360);
    expect(result[0].hos?.dutyMinutesRemaining).toBe(0);
    expect(result[0].hos?.cycleMinutesRemaining).toBe(0);
    expect(result[0].hos?.breakMinutesRemaining).toBeNull();
  });

  it('returns hos=null when driver has no hosData', async () => {
    mockPrisma.load.findMany.mockResolvedValueOnce([
      inTransitLoad({
        driver: {
          id: 100,
          driverId: 'DRV-001',
          name: 'Hector Velez',
          hosData: null,
          hosDataSyncedAt: null,
        },
      }),
    ]);

    const result = await service.findActiveLoads(1, 4);

    expect(result[0].hos).toBeNull();
  });

  describe('etaAt — live GPS baseline', () => {
    it('computes etaAt from the live GPS ETA for a load with NO route plan', async () => {
      // Manual / unplanned load: no routePlanLoads. Truck has a GPS ping and
      // the next stop is geocoded → ETA = now + drive-minutes.
      mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);
      mockIntegrationData.getVehicleLocation.mockResolvedValueOnce({
        vehicleId: 'VEH-005',
        latitude: 38.62,
        longitude: -90.19,
      });
      // 75 min of drive time from the truck to the next stop.
      mockEtaCalculator.getEstimatedDriveMinutes.mockResolvedValueOnce(75);

      const result = await service.findActiveLoads(1, 4);

      // now 12:00 + 75 min → 13:15
      expect(result[0].etaAt).toBe('2026-05-15T13:15:00.000Z');
      expect(mockEtaCalculator.getEstimatedDriveMinutes).toHaveBeenCalledWith(
        { lat: 38.62, lon: -90.19 },
        { lat: 32.78, lon: -96.8 },
      );
      // appointment 13:30 − ETA 13:15 → +15 min slack
      expect(result[0].slackMinutes).toBe(15);
    });

    it('resolves GPS via the load tenant + vehicle slug', async () => {
      mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);

      await service.findActiveLoads(1, 4);

      expect(mockIntegrationData.getVehicleLocation).toHaveBeenCalledWith(1, 'VEH-005');
    });

    it('returns etaAt=null when the truck has no GPS ping', async () => {
      // No GPS → no honest ETA → slack falls back to appointment − now.
      mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);
      mockIntegrationData.getVehicleLocation.mockResolvedValueOnce(null);

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBeNull();
      expect(mockEtaCalculator.getEstimatedDriveMinutes).not.toHaveBeenCalled();
      // appointment 13:30 − now 12:00 = 90 min
      expect(result[0].slackMinutes).toBe(90);
    });

    it('returns etaAt=null when the load has no vehicle', async () => {
      mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad({ vehicle: null })]);

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBeNull();
      expect(mockIntegrationData.getVehicleLocation).not.toHaveBeenCalled();
    });

    it('returns etaAt=null when the next stop is not geocoded', async () => {
      const load = inTransitLoad();
      load.stops[1].stop.lat = null as any;
      load.stops[1].stop.lon = null as any;
      mockPrisma.load.findMany.mockResolvedValueOnce([load]);
      mockIntegrationData.getVehicleLocation.mockResolvedValueOnce({
        vehicleId: 'VEH-005',
        latitude: 38.62,
        longitude: -90.19,
      });

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBeNull();
      expect(mockEtaCalculator.getEstimatedDriveMinutes).not.toHaveBeenCalled();
    });

    it('returns etaAt=null when the ETA calculator yields no estimate', async () => {
      mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);
      mockIntegrationData.getVehicleLocation.mockResolvedValueOnce({
        vehicleId: 'VEH-005',
        latitude: 38.62,
        longitude: -90.19,
      });
      mockEtaCalculator.getEstimatedDriveMinutes.mockResolvedValueOnce(null);

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBeNull();
    });

    it('survives a GPS lookup failure and falls back to etaAt=null', async () => {
      mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);
      mockIntegrationData.getVehicleLocation.mockRejectedValueOnce(new Error('Redis down'));

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBeNull();
      expect(result[0].slackMinutes).toBe(90);
    });
  });

  describe('etaAt — route-plan refinement', () => {
    it('prefers the route-plan ETA over the live GPS ETA when a plan exists', async () => {
      // Plan puts the next dock at 13:15. The plan wins because it is
      // HOS/rest-aware — the GPS path is short-circuited before it is reached.
      mockPrisma.load.findMany.mockResolvedValueOnce([routePlannedLoad()]);

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBe('2026-05-15T13:15:00.000Z');
      // Plan ETA short-circuits — GPS path is never consulted.
      expect(mockEtaCalculator.getEstimatedDriveMinutes).not.toHaveBeenCalled();
      // appointment 13:30 − plan ETA 13:15 → +15 min
      expect(result[0].slackMinutes).toBe(15);
    });

    it('prefers the GPS-corrected updatedEta over the planned estimatedArrival', async () => {
      const load = routePlannedLoad();
      // Truck is running late — updatedEta pushes the next-dock arrival to 13:50.
      load.routePlanLoads[0].plan.segments[1].updatedEta = new Date('2026-05-15T13:50:00.000Z');
      mockPrisma.load.findMany.mockResolvedValueOnce([load]);

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBe('2026-05-15T13:50:00.000Z');
      // appointment 13:30 − ETA 13:50 → 20 min late
      expect(result[0].slackMinutes).toBe(-20);
    });

    it('falls back to the plan-wide estimatedArrival when no dock segment carries one', async () => {
      const load = routePlannedLoad();
      // Strip the per-segment ETAs; only the plan-level estimate remains.
      load.routePlanLoads[0].plan.segments = [];
      mockPrisma.load.findMany.mockResolvedValueOnce([load]);

      const result = await service.findActiveLoads(1, 4);

      expect(result[0].etaAt).toBe('2026-05-15T14:00:00.000Z');
    });

    it('falls back to the GPS ETA when the plan carries no usable ETA', async () => {
      const load = routePlannedLoad();
      // Plan exists but has no segment ETAs and no plan-wide estimate.
      load.routePlanLoads[0].plan.segments = [];
      load.routePlanLoads[0].plan.estimatedArrival = null;
      mockPrisma.load.findMany.mockResolvedValueOnce([load]);
      mockIntegrationData.getVehicleLocation.mockResolvedValueOnce({
        vehicleId: 'VEH-005',
        latitude: 38.62,
        longitude: -90.19,
      });
      mockEtaCalculator.getEstimatedDriveMinutes.mockResolvedValueOnce(60);

      const result = await service.findActiveLoads(1, 4);

      // now 12:00 + 60 min → 13:00
      expect(result[0].etaAt).toBe('2026-05-15T13:00:00.000Z');
    });
  });

  it('returns slackMinutes=null when nextStop has no appointment', async () => {
    const load = inTransitLoad();
    load.stops[1].latestArrival = null;
    load.stops[1].earliestArrival = null;
    load.stops[1].appointmentDate = null;
    mockPrisma.load.findMany.mockResolvedValueOnce([load]);

    const result = await service.findActiveLoads(1, 4);

    expect(result[0].slackMinutes).toBeNull();
  });

  it('emits current and next stop fields shaped per ActiveLoadStop', async () => {
    mockPrisma.load.findMany.mockResolvedValueOnce([inTransitLoad()]);

    const result = await service.findActiveLoads(1, 4);

    expect(result[0].currentStop).toMatchObject({
      stopId: 'STP-001',
      kind: 'pickup',
      city: 'Chicago',
      state: 'IL',
    });
    expect(result[0].nextStop).toMatchObject({
      stopId: 'STP-002',
      kind: 'delivery',
      city: 'Dallas',
      state: 'TX',
    });
  });
});

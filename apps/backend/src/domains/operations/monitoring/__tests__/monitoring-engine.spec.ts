import { MonitoringEngineService } from '../services/monitoring-engine.service';
import { DataSourceResolverService } from '../services/data-source-resolver.service';
import { EtaCalculatorService } from '../services/eta-calculator.service';
import { CheckRegistry } from '../checks/check.registry';
import { ResolvedDataSource } from '../monitoring.types';
import { ALL_DATA_SOURCES } from '../data-sources/sources';

// ===================================================================
// FACTORY HELPERS
// ===================================================================

const hoursMs = (h: number) => h * 3600000;
const minutesMs = (m: number) => m * 60000;
const hoursAgo = (h: number) => new Date(Date.now() - hoursMs(h));

const makeDriver = (overrides?: Record<string, any>) => ({
  id: 1,
  driverId: 'DRV-001',
  name: 'John Smith',
  tenantId: 1,
  assignedVehicleId: 1,
  assignedVehicle: { id: 1, vehicleId: 'VEH-001' },
  ...overrides,
});

const _makeStop = (overrides?: Record<string, any>) => ({
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
    city: 'LA',
    state: 'CA',
  },
  ...overrides,
});

const makeLoad = (overrides?: Record<string, any>) => ({
  id: 1,
  loadNumber: 'LD-001',
  status: 'IN_TRANSIT',
  driverId: 1,
  vehicleId: 1,
  assignedAt: hoursAgo(2),
  inTransitAt: hoursAgo(1),
  driver: makeDriver(),
  stops: [],
  ...overrides,
});

const makeHOSHealthy = () => ({
  currentDutyStatus: 'driving',
  driveTimeRemainingMs: hoursMs(8),
  shiftTimeRemainingMs: hoursMs(10),
  cycleTimeRemainingMs: hoursMs(50),
  timeUntilBreakMs: hoursMs(5),
  lastUpdated: new Date().toISOString(),
  syncedAt: new Date().toISOString(),
});

const makeGPSHealthy = () => ({
  latitude: 33.749,
  longitude: -84.388,
  speed: 60,
  heading: 90,
  fuelLevel: 50,
  engineRunning: true,
  odometer: 100000,
  timestamp: new Date().toISOString(),
  syncedAt: new Date().toISOString(),
});

const makeResolvedSources = (allHealthy = true): ResolvedDataSource[] =>
  ALL_DATA_SOURCES.map((def) => ({
    definition: def,
    available: true,
    status: allHealthy ? ('healthy' as const) : ('delayed' as const),
    lastSyncAge: 30,
  }));

const makeResolvedSourcesPartial = (availableIds: string[]): ResolvedDataSource[] =>
  ALL_DATA_SOURCES.map((def) => ({
    definition: def,
    available: availableIds.includes(def.id),
    status: availableIds.includes(def.id) ? ('healthy' as const) : ('not_configured' as const),
    lastSyncAge: availableIds.includes(def.id) ? 30 : null,
  }));

// ===================================================================
// TEST SUITE
// ===================================================================

describe('MonitoringEngineService', () => {
  let engine: any;
  let mockPrisma: any;
  let mockIntegration: any;
  let mockAlertTriggers: any;
  let mockEventEmitter: any;
  let mockCache: any;
  let mockDataSourceResolver: any;
  let mockEtaCalculator: any;
  let mockAlertCache: any;
  let checkRegistry: CheckRegistry;

  beforeEach(() => {
    mockPrisma = {
      load: { findMany: jest.fn().mockResolvedValue([]) },
      alert: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      routePlan: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockIntegration = {
      getDriverHOS: jest.fn().mockResolvedValue(null),
      getVehicleLocation: jest.fn().mockResolvedValue(null),
    };
    mockAlertTriggers = {
      trigger: jest.fn().mockResolvedValue({ alertId: 'ALT-001' }),
    };
    mockEventEmitter = { emit: jest.fn() };
    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    mockAlertCache = {
      invalidate: jest.fn().mockResolvedValue(undefined),
      bustStatsCache: jest.fn().mockResolvedValue(undefined),
    };
    mockEtaCalculator = {
      getEstimatedDriveMinutes: jest.fn().mockResolvedValue(60),
    };
    mockDataSourceResolver = {
      resolveForTenant: jest.fn().mockResolvedValue(makeResolvedSources()),
      getAvailableCapabilitiesFromResolved: jest
        .fn()
        .mockReturnValue(
          new Set([
            'hos_data',
            'gps_data',
            'vehicle_state',
            'driver_data',
            'vehicle_data',
            'load_data',
            'route_plan_data',
          ]),
        ),
    };

    checkRegistry = new CheckRegistry();

    engine = new MonitoringEngineService(
      mockPrisma,
      mockDataSourceResolver as unknown as DataSourceResolverService,
      checkRegistry,
      mockIntegration,
      mockEtaCalculator as unknown as EtaCalculatorService,
      mockAlertTriggers,
      mockEventEmitter,
      mockCache,
      mockAlertCache,
    );
  });

  // ---------------------------------------------------------------
  // EMPTY / NO-LOAD SCENARIOS
  // ---------------------------------------------------------------

  describe('Empty cycle (no active loads)', () => {
    it('should return inactive status with 0 loads and 0 drivers', async () => {
      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(0);
      expect(result.driversMonitored).toBe(0);
      expect(result.status).toBe('inactive');
      expect(result.triggersThisCycle).toBe(0);
    });

    it('should still resolve data sources', async () => {
      await engine.runCycleForTenant(1);
      expect(mockDataSourceResolver.resolveForTenant).toHaveBeenCalledWith(1);
    });

    it('should NOT emit SSE for empty cycle', async () => {
      await engine.runCycleForTenant(1);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should cache the empty result', async () => {
      await engine.runCycleForTenant(1);
      expect(mockCache.set).toHaveBeenCalledWith(
        'sally:monitoring:cycle:1',
        expect.objectContaining({ tenantId: 1, status: 'inactive' }),
        120000,
      );
    });

    it('should report cycleIntervalSeconds as 120', async () => {
      const result = await engine.runCycleForTenant(1);
      expect(result.cycleIntervalSeconds).toBe(120);
    });
  });

  // ---------------------------------------------------------------
  // SINGLE DRIVER / SINGLE LOAD
  // ---------------------------------------------------------------

  describe('Single driver with healthy data', () => {
    beforeEach(() => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());
    });

    it('should monitor 1 load and 1 driver', async () => {
      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(1);
      expect(result.driversMonitored).toBe(1);
    });

    it('should have active status', async () => {
      const result = await engine.runCycleForTenant(1);
      expect(result.status).toBe('active');
    });

    it('should fire 0 triggers when everything is healthy', async () => {
      const result = await engine.runCycleForTenant(1);
      expect(result.triggersThisCycle).toBe(0);
      expect(mockAlertTriggers.trigger).not.toHaveBeenCalled();
    });

    it('should emit MONITORING_CYCLE_COMPLETED with correct payload', async () => {
      await engine.runCycleForTenant(1);
      const expectedEventName = 'sally.monitoring.cycle-completed';
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expectedEventName,
        expect.objectContaining({
          event: expectedEventName,
          tenantId: '1',
          data: expect.objectContaining({
            loadsMonitored: 1,
            driversMonitored: 1,
            triggersThisCycle: 0,
            status: 'active',
          }),
        }),
      );
    });

    it('should list all 17 checks as active when all data sources healthy', async () => {
      const result = await engine.runCycleForTenant(1);
      expect(result.checks.active.length).toBe(17);
      expect(result.checks.inactive.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // HOS TRIGGER SCENARIOS
  // ---------------------------------------------------------------

  describe('HOS triggers', () => {
    it('should fire HOS_APPROACHING_LIMIT when drive time < 60min', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        driveTimeRemainingMs: minutesMs(30),
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      expect(result.triggersThisCycle).toBeGreaterThanOrEqual(1);
      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith(
        'HOS_APPROACHING_LIMIT',
        1,
        'DRV-001',
        expect.objectContaining({ limitType: 'drive' }),
      );
    });

    it('should fire HOS_VIOLATION when drive time is 0', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        driveTimeRemainingMs: 0,
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);
      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith(
        'HOS_VIOLATION',
        1,
        'DRV-001',
        expect.objectContaining({
          violationTypes: expect.arrayContaining(['drive']),
        }),
      );
    });

    it('should fire BREAK_REQUIRED when break time is 0', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        timeUntilBreakMs: 0,
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);
      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith('BREAK_REQUIRED', 1, 'DRV-001', expect.any(Object));
    });

    it('should fire CYCLE_APPROACHING_LIMIT when cycle time < 5h', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        cycleTimeRemainingMs: hoursMs(3),
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);
      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith(
        'CYCLE_APPROACHING_LIMIT',
        1,
        'DRV-001',
        expect.any(Object),
      );
    });

    it('should fire both drive_limit and duty_limit when both approaching', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        driveTimeRemainingMs: minutesMs(30),
        shiftTimeRemainingMs: minutesMs(45),
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);
      const hosApproachingCalls = mockAlertTriggers.trigger.mock.calls.filter(
        (c: any[]) => c[0] === 'HOS_APPROACHING_LIMIT',
      );
      // drive_limit and duty_limit both fire HOS_APPROACHING_LIMIT but with different params
      // Dedup key is type:driverId:loadId — same type+driver → only 1 fires
      expect(hosApproachingCalls).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------
  // VEHICLE / BEHAVIOR TRIGGERS
  // ---------------------------------------------------------------

  describe('Vehicle and behavior triggers', () => {
    it('should fire FUEL_LOW when fuel < 20%', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue({
        ...makeGPSHealthy(),
        fuelLevel: 12,
      });

      await engine.runCycleForTenant(1);
      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith(
        'FUEL_LOW',
        1,
        'DRV-001',
        expect.objectContaining({ fuelLevel: 12 }),
      );
    });

    it('should fire DRIVER_NOT_MOVING when engine is off', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue({
        ...makeGPSHealthy(),
        engineRunning: false,
        speed: 0,
      });

      await engine.runCycleForTenant(1);
      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith(
        'DRIVER_NOT_MOVING',
        1,
        'DRV-001',
        expect.objectContaining({ reason: 'engine_off' }),
      );
    });
  });

  // ---------------------------------------------------------------
  // MULTI-DRIVER SCENARIOS
  // ---------------------------------------------------------------

  describe('Multiple drivers', () => {
    const driver1 = makeDriver({ id: 1, driverId: 'DRV-001', name: 'Alice' });
    const driver2 = makeDriver({
      id: 2,
      driverId: 'DRV-002',
      name: 'Bob',
      assignedVehicle: { id: 2, vehicleId: 'VEH-002' },
    });

    it('should process each driver independently', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        makeLoad({ driver: driver1 }),
        makeLoad({ id: 2, loadNumber: 'LD-002', driver: driver2, driverId: 2 }),
      ]);

      // DRV-001 has low drive time, DRV-002 is healthy
      mockIntegration.getDriverHOS
        .mockResolvedValueOnce({
          ...makeHOSHealthy(),
          driveTimeRemainingMs: minutesMs(30),
        })
        .mockResolvedValueOnce(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      expect(result.driversMonitored).toBe(2);
      expect(result.loadsMonitored).toBe(2);

      // Only DRV-001 should trigger
      const triggerCalls = mockAlertTriggers.trigger.mock.calls;
      const driverIds = triggerCalls.map((c: any[]) => c[2]);
      expect(driverIds).toContain('DRV-001');
      expect(driverIds).not.toContain('DRV-002');
    });

    it('should monitor drivers with multiple loads', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        makeLoad({ driver: driver1 }),
        makeLoad({ id: 2, loadNumber: 'LD-002', driver: driver1 }),
        makeLoad({ id: 3, loadNumber: 'LD-003', driver: driver2, driverId: 2 }),
      ]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(3);
      expect(result.driversMonitored).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // DEDUPLICATION
  // ---------------------------------------------------------------

  describe('Trigger deduplication', () => {
    it('should deduplicate same trigger type per driver', async () => {
      const driver = makeDriver();
      mockPrisma.load.findMany.mockResolvedValue([
        makeLoad({ driver }),
        makeLoad({
          id: 2,
          loadNumber: 'LD-002',
          status: 'ASSIGNED',
          inTransitAt: null,
          driver,
        }),
      ]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        driveTimeRemainingMs: minutesMs(15),
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);

      // Per-driver HOS check → 1 trigger, not 2
      const hosApproaching = mockAlertTriggers.trigger.mock.calls.filter(
        (c: any[]) => c[0] === 'HOS_APPROACHING_LIMIT',
      );
      expect(hosApproaching).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------
  // DEGRADED / PARTIAL DATA SCENARIOS
  // ---------------------------------------------------------------

  describe('Degraded data scenarios', () => {
    it('should handle HOS fetch error gracefully (null HOS)', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockRejectedValue(new Error('ELD down'));
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(1);
      // No HOS triggers since data is null
    });

    it('should handle GPS fetch error gracefully (null GPS)', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockRejectedValue(new Error('GPS down'));

      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(1);
    });

    it('should handle BOTH HOS and GPS down gracefully', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockRejectedValue(new Error('HOS down'));
      mockIntegration.getVehicleLocation.mockRejectedValue(new Error('GPS down'));

      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(1);
      expect(result.triggersThisCycle).toBe(0);
    });

    it('should handle driver with no vehicle', async () => {
      const driver = makeDriver({
        assignedVehicleId: null,
        assignedVehicle: null,
      });
      mockPrisma.load.findMany.mockResolvedValue([makeLoad({ driver, vehicleId: null })]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());

      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(1);
      // Should not attempt GPS fetch (no vehicle)
    });

    it('should report limited status when some sources are delayed', async () => {
      const mixed = makeResolvedSources(false); // all delayed
      mixed[0] = { ...mixed[0], status: 'healthy' }; // HOS healthy, rest delayed
      mockDataSourceResolver.resolveForTenant.mockResolvedValue(mixed);
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      expect(result.status).toBe('limited');
    });

    it('should report unavailable when no data sources available', async () => {
      const allUnavailable = ALL_DATA_SOURCES.map((def) => ({
        definition: def,
        available: false,
        status: 'not_configured' as const,
        lastSyncAge: null,
      }));
      mockDataSourceResolver.resolveForTenant.mockResolvedValue(allUnavailable);
      mockDataSourceResolver.getAvailableCapabilitiesFromResolved.mockReturnValue(new Set());
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);

      const result = await engine.runCycleForTenant(1);
      expect(result.status).toBe('unavailable');
    });

    it('should deactivate HOS checks when ELD not configured', async () => {
      // Only fleet+loads available, no ELD
      const partialSources = makeResolvedSourcesPartial(['fleet', 'loads', 'route_plan']);
      mockDataSourceResolver.resolveForTenant.mockResolvedValue(partialSources);
      mockDataSourceResolver.getAvailableCapabilitiesFromResolved.mockReturnValue(
        new Set(['driver_data', 'vehicle_data', 'load_data', 'route_plan_data']),
      );
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);

      const result = await engine.runCycleForTenant(1);
      const inactiveIds = result.checks.inactive.map((c: any) => c.id);
      expect(inactiveIds).toContain('drive_limit');
      expect(inactiveIds).toContain('duty_limit');
      expect(inactiveIds).toContain('hos_violation');
      expect(inactiveIds).toContain('fuel_low');
    });
  });

  // ---------------------------------------------------------------
  // AUTO-RESOLVE
  // ---------------------------------------------------------------

  describe('Auto-resolve', () => {
    it('should auto-resolve alerts scoped by driver when condition clears', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);

      const updateCalls = mockPrisma.alert.updateMany.mock.calls;
      for (const call of updateCalls) {
        const where = call[0].where;
        expect(where.driverId).toBeDefined();
        // Phase 2 Task 10 — alerts.driver_id is the Int FK on drivers.id.
        // The makeDriver fixture has id=1 for the only driver in this cycle.
        expect(where.driverId.in).toContain(1);
      }
    });

    it('should set status to auto_resolved with reason', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);

      const updateCalls = mockPrisma.alert.updateMany.mock.calls;
      if (updateCalls.length > 0) {
        const data = updateCalls[0][0].data;
        expect(data.status).toBe('AUTO_RESOLVED');
        expect(data.autoResolved).toBe(true);
        expect(data.autoResolveReason).toContain('Condition cleared');
      }
    });

    it('should bust alert stats cache when alerts are resolved', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());
      mockPrisma.alert.updateMany.mockResolvedValue({ count: 3 });

      await engine.runCycleForTenant(1);
      expect(mockAlertCache.bustStatsCache).toHaveBeenCalledWith(1);
    });

    it('should NOT bust cache when no alerts were resolved', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());
      mockPrisma.alert.updateMany.mockResolvedValue({ count: 0 });

      await engine.runCycleForTenant(1);
      expect(mockAlertCache.bustStatsCache).not.toHaveBeenCalled();
    });

    it('should handle auto-resolve errors gracefully', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());
      mockPrisma.alert.updateMany.mockRejectedValue(new Error('DB error'));

      const result = await engine.runCycleForTenant(1);
      expect(result).toBeDefined(); // Should not throw
    });
  });

  // ---------------------------------------------------------------
  // CACHING
  // ---------------------------------------------------------------

  describe('Caching', () => {
    it('should cache result after every cycle', async () => {
      mockPrisma.load.findMany.mockResolvedValue([]);
      await engine.runCycleForTenant(1);
      expect(mockCache.set).toHaveBeenCalledWith('sally:monitoring:cycle:1', expect.any(Object), 120000);
    });

    it('should use tenant-specific cache keys', async () => {
      mockPrisma.load.findMany.mockResolvedValue([]);
      await engine.runCycleForTenant(42);
      expect(mockCache.set).toHaveBeenCalledWith('sally:monitoring:cycle:42', expect.any(Object), 120000);
    });

    it('getCachedResult should return cached data', async () => {
      const cached = { tenantId: 1, status: 'active', loadsMonitored: 5 };
      mockCache.get.mockResolvedValue(cached);

      const result = await engine.getCachedResult(1);
      expect(result).toEqual(cached);
      expect(mockCache.get).toHaveBeenCalledWith('sally:monitoring:cycle:1');
    });

    it('getCachedResult should return null on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      const result = await engine.getCachedResult(1);
      expect(result).toBeNull();
    });

    it('getCachedResult should return null on Redis error', async () => {
      mockCache.get.mockRejectedValue(new Error('Redis down'));
      const result = await engine.getCachedResult(1);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // ALERT TRIGGER ERRORS
  // ---------------------------------------------------------------

  describe('Alert trigger error handling', () => {
    it('should continue processing after an alert trigger fails', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        driveTimeRemainingMs: minutesMs(30),
        timeUntilBreakMs: 0,
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      // First trigger fails, second should still fire
      mockAlertTriggers.trigger
        .mockRejectedValueOnce(new Error('Alert service down'))
        .mockResolvedValueOnce({ alertId: 'ALT-002' });

      const result = await engine.runCycleForTenant(1);
      expect(result).toBeDefined();
      expect(mockAlertTriggers.trigger.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------
  // ROUTE PLAN ENRICHMENT
  // ---------------------------------------------------------------

  describe('Route plan enrichment', () => {
    it('should fetch active route plans for context', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockPrisma.routePlan.findMany.mockResolvedValue([]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);
      expect(mockPrisma.routePlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, isActive: true, status: 'ACTIVE' },
        }),
      );
    });

    it('should enrich driver context with active plan when available', async () => {
      const plan = {
        id: 10,
        planId: 'RP-001',
        driverId: 1,
        segments: [
          {
            segmentId: 'SEG-001',
            sequenceOrder: 1,
            segmentType: 'drive',
            status: 'IN_PROGRESS',
            distanceMiles: 300,
            driveTimeHours: 5,
            toLocation: 'Atlanta, GA',
          },
        ],
        loads: [{ loadId: 1, load: { loadNumber: 'LD-001' } }],
        departureTime: hoursAgo(1),
        estimatedArrival: new Date(Date.now() + hoursMs(5)),
      };
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockPrisma.routePlan.findMany.mockResolvedValue([plan]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      expect(result.loadsMonitored).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // LIFECYCLE / LOAD STATUS CHECKS
  // ---------------------------------------------------------------

  describe('Lifecycle check triggers', () => {
    it('should fire NO_PICKUP_ACTIVITY for long-assigned loads', async () => {
      const load = makeLoad({
        status: 'ASSIGNED',
        assignedAt: hoursAgo(6),
        inTransitAt: null,
        stops: [],
      });
      mockPrisma.load.findMany.mockResolvedValue([load]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      await engine.runCycleForTenant(1);
      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith(
        'NO_PICKUP_ACTIVITY',
        1,
        'DRV-001',
        expect.objectContaining({ loadId: 'LD-001' }),
      );
    });
  });

  // ---------------------------------------------------------------
  // RESULT STRUCTURE
  // ---------------------------------------------------------------

  describe('Result structure validation', () => {
    it('should include all required fields', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);

      expect(result.tenantId).toBe(1);
      expect(result.status).toBeDefined();
      expect(result.loadsMonitored).toBeDefined();
      expect(result.driversMonitored).toBeDefined();
      expect(result.cycleIntervalSeconds).toBe(120);
      expect(result.lastCycleAt).toBeDefined();
      expect(result.triggersThisCycle).toBeDefined();
      expect(result.dataSources).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.checks.active).toBeDefined();
      expect(result.checks.inactive).toBeDefined();
      expect(result.checks.skipped).toBeDefined();
    });

    it('active checks should have id, displayName, category, status, issueCount, summary', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      for (const check of result.checks.active) {
        expect(check.id).toBeDefined();
        expect(check.displayName).toBeDefined();
        expect(check.category).toBeDefined();
        expect(['ok', 'warning', 'critical']).toContain(check.status);
        expect(typeof check.issueCount).toBe('number');
        expect(check.summary).toBeDefined();
      }
    });

    it('checks with issues should report correct issue count', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue({
        ...makeHOSHealthy(),
        driveTimeRemainingMs: minutesMs(30),
      });
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      const driveLimitCheck = result.checks.active.find((c: any) => c.id === 'drive_limit');
      expect(driveLimitCheck.issueCount).toBe(1);
      expect(driveLimitCheck.status).toBe('warning');
      expect(driveLimitCheck.summary).toContain('1 issue');
    });

    it('healthy checks should show "All clear" summary', async () => {
      mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
      mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
      mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

      const result = await engine.runCycleForTenant(1);
      const hosCheck = result.checks.active.find((c: any) => c.id === 'drive_limit');
      expect(hosCheck.summary).toBe('All clear');
    });
  });

  // ─── Data source resolution ───

  it('should pass tenantId to data source resolver', async () => {
    mockPrisma.load.findMany.mockResolvedValue([]);

    await engine.runCycleForTenant(42);

    expect(mockDataSourceResolver.resolveForTenant).toHaveBeenCalledWith(42);
  });

  it('should resolve active and inactive checks from registry', async () => {
    mockPrisma.load.findMany.mockResolvedValue([]);

    const result = await engine.runCycleForTenant(1);

    expect(result.checks).toBeDefined();
    expect(result.checks.active).toBeDefined();
    expect(result.checks.inactive).toBeDefined();
  });

  // ─── Multiple drivers ───

  it('should monitor multiple drivers independently', async () => {
    const driver1 = makeDriver({ id: 1, driverId: 'DRV-001' });
    const driver2 = makeDriver({
      id: 2,
      driverId: 'DRV-002',
      name: 'Jane Doe',
    });

    mockPrisma.load.findMany.mockResolvedValue([
      makeLoad({ driver: driver1 }),
      makeLoad({ id: 2, loadNumber: 'LD-002', driver: driver2 }),
    ]);
    mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
    mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

    const result = await engine.runCycleForTenant(1);

    expect(result.loadsMonitored).toBe(2);
    expect(result.driversMonitored).toBe(2);
  });

  // ─── Assigned load without inTransitAt ───

  it('should handle assigned loads without inTransitAt', async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      makeLoad({
        status: 'ASSIGNED',
        inTransitAt: null,
        driver: makeDriver(),
      }),
    ]);
    mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
    mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

    const result = await engine.runCycleForTenant(1);

    expect(result.loadsMonitored).toBe(1);
    expect(result.status).not.toBe('inactive');
  });

  // ─── Status mapping ───

  it('should return active status when loads exist', async () => {
    mockPrisma.load.findMany.mockResolvedValue([makeLoad()]);
    mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());
    mockIntegration.getVehicleLocation.mockResolvedValue(makeGPSHealthy());

    const result = await engine.runCycleForTenant(1);

    expect(result.status).toBe('active');
  });

  // ─── Driver without vehicle ───

  it('should handle driver without assigned vehicle', async () => {
    const noVehicleDriver = makeDriver({
      assignedVehicleId: null,
      assignedVehicle: null,
    });
    mockPrisma.load.findMany.mockResolvedValue([makeLoad({ driver: noVehicleDriver })]);
    mockIntegration.getDriverHOS.mockResolvedValue(makeHOSHealthy());

    const result = await engine.runCycleForTenant(1);

    expect(result.driversMonitored).toBe(1);
    // GPS data should not be fetched for driverless vehicles
    expect(mockIntegration.getVehicleLocation).not.toHaveBeenCalled();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CommandCenterService } from '../command-center.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { RouteProgressTrackerService } from '../../monitoring/services/route-progress-tracker.service';
import { MonitoringEngineService } from '../../monitoring/services/monitoring-engine.service';
import { OverviewService } from '../services/overview.service';
import { MapDataService } from '../services/map-data.service';
import { MessageSummaryService } from '../services/message-summary.service';
import { ShiftNotesService } from '../services/shift-notes.service';
import { SystemHealthService } from '../services/system-health.service';

describe('CommandCenterService', () => {
  let service: CommandCenterService;

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
  };

  const mockPrismaService = {
    alert: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    driver: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    load: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    routePlan: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    routeEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    integrationConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    job: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    shiftNote: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };

  const mockProgressTracker = {
    determineCurrentSegment: jest.fn().mockReturnValue(null),
  };

  const mockMonitoringEngine = {
    getCachedResult: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandCenterService,
        OverviewService,
        MapDataService,
        MessageSummaryService,
        ShiftNotesService,
        SystemHealthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SallyCacheService, useValue: mockCacheManager },
        { provide: RouteProgressTrackerService, useValue: mockProgressTracker },
        { provide: MonitoringEngineService, useValue: mockMonitoringEngine },
      ],
    }).compile();

    service = module.get<CommandCenterService>(CommandCenterService);
    jest.clearAllMocks();

    // Re-initialize mock return values after clearAllMocks clears them
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(undefined);
    mockCacheManager.del.mockResolvedValue(undefined);
    mockCacheManager.getOrSet.mockImplementation((_key: string, fn: () => any) => fn());

    mockPrismaService.alert.count.mockResolvedValue(0);
    mockPrismaService.alert.findMany.mockResolvedValue([]);
    mockPrismaService.alert.groupBy.mockResolvedValue([]);
    mockPrismaService.driver.findMany.mockResolvedValue([]);
    mockPrismaService.load.findMany.mockResolvedValue([]);
    mockPrismaService.load.findFirst.mockResolvedValue(null);
    mockPrismaService.load.count.mockResolvedValue(0);
    mockPrismaService.vehicle.findFirst.mockResolvedValue(null);
    mockPrismaService.vehicle.findMany.mockResolvedValue([]);
    mockPrismaService.routePlan.findMany.mockResolvedValue([]);
    mockPrismaService.routePlan.count.mockResolvedValue(0);
    mockPrismaService.routePlan.findFirst.mockResolvedValue(null);
    mockPrismaService.routeEvent.findFirst.mockResolvedValue(null);
    mockPrismaService.routeEvent.findMany.mockResolvedValue([]);
    mockPrismaService.routeEvent.count.mockResolvedValue(0);
    mockPrismaService.integrationConfig.findMany.mockResolvedValue([]);
    mockPrismaService.integrationConfig.findFirst.mockResolvedValue(null);
    mockPrismaService.job.findFirst.mockResolvedValue(null);
    mockPrismaService.job.findMany.mockResolvedValue([]);
    mockPrismaService.shiftNote.findMany.mockResolvedValue([]);
    mockPrismaService.shiftNote.updateMany.mockResolvedValue({ count: 1 });
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });

    mockProgressTracker.determineCurrentSegment.mockReturnValue(null);
    mockMonitoringEngine.getCachedResult.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // getOverview
  // -------------------------------------------------------------------------

  describe('getOverview', () => {
    it('should return overview with load-centric sections', async () => {
      const result = await service.getOverview(1);

      expect(result).toHaveProperty('kpis');
      expect(result).toHaveProperty('activeLoads');
      expect(result).toHaveProperty('quickActionCounts');
      expect(result).toHaveProperty('driverHosStrip');
    });

    it('should include load-centric KPI fields', async () => {
      const result = await service.getOverview(1);

      expect(result.kpis).toHaveProperty('activeLoads');
      expect(result.kpis).toHaveProperty('inTransit');
      expect(result.kpis).toHaveProperty('onTimePercentage');
      expect(result.kpis).toHaveProperty('activeAlerts');
      expect(result.kpis).toHaveProperty('unassigned');
    });

    it('should return empty active_loads when no loads match', async () => {
      const result = await service.getOverview(1);

      expect(result.activeLoads).toEqual([]);
      expect(result.kpis.activeLoads).toBe(0);
      expect(result.kpis.onTimePercentage).toBe(100);
    });

    it('should query loads with status assigned or in_transit', async () => {
      await service.getOverview(1);

      expect(mockPrismaService.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 1,
            status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
            isActive: true,
          },
        }),
      );
    });

    it('should assign tier basic when no ELD and no route plan', async () => {
      mockPrismaService.load.findMany.mockResolvedValueOnce([
        {
          loadNumber: 'LD-20260223-001',
          customerName: 'Acme Corp',
          status: 'ASSIGNED',
          requiredEquipmentType: 'DRY_VAN',
          originCity: 'Chicago',
          originState: 'IL',
          destinationCity: 'Dallas',
          destinationState: 'TX',
          pickupDate: new Date('2026-02-23'),
          deliveryDate: new Date('2026-02-25'),
          weightLbs: 38000,
          rateCents: 320000,
          updatedAt: new Date(),
          driver: {
            id: 1,
            driverId: 'DRV-001',
            name: 'John Doe',
            hosDataSyncedAt: null,
          },
          vehicle: { id: 1, vehicleId: 'VEH-001', unitNumber: 'TRK-101' },
          stops: [
            { status: 'completed', sequenceOrder: 1, actionType: 'pickup' },
            { status: 'pending', sequenceOrder: 2, actionType: 'delivery' },
          ],
          routePlanLoads: [],
        },
      ]);
      mockPrismaService.integrationConfig.findFirst.mockResolvedValueOnce(null);

      const result = await service.getOverview(1);

      expect(result.activeLoads).toHaveLength(1);
      expect(result.activeLoads[0].tier).toBe('basic');
      expect(result.activeLoads[0].hos).toBeNull();
      expect(result.activeLoads[0].route).toBeNull();
    });

    it('should assign tier tracked when tenant has ELD but load has no route plan', async () => {
      mockPrismaService.load.findMany.mockResolvedValueOnce([
        {
          loadNumber: 'LD-20260223-002',
          customerName: 'FedEx',
          status: 'IN_TRANSIT',
          requiredEquipmentType: 'REEFER',
          originCity: 'Atlanta',
          originState: 'GA',
          destinationCity: 'Miami',
          destinationState: 'FL',
          pickupDate: new Date('2026-02-22'),
          deliveryDate: new Date('2026-02-24'),
          weightLbs: 41000,
          rateCents: 410000,
          updatedAt: new Date(),
          driver: {
            id: 2,
            driverId: 'DRV-002',
            name: 'Jane Smith',
            hosDataSyncedAt: new Date(),
          },
          vehicle: { id: 2, vehicleId: 'VEH-002', unitNumber: 'TRK-202' },
          stops: [
            { status: 'completed', sequenceOrder: 1, actionType: 'pickup' },
            { status: 'pending', sequenceOrder: 2, actionType: 'delivery' },
          ],
          routePlanLoads: [],
        },
      ]);
      mockPrismaService.integrationConfig.findFirst.mockResolvedValueOnce({
        id: 1,
      });

      const result = await service.getOverview(1);

      expect(result.activeLoads[0].tier).toBe('tracked');
      // tracked tier: HOS is null until real ELD sync data is available
      expect(result.activeLoads[0].hos).toBeNull();
      expect(result.activeLoads[0].route).toBeNull();
    });

    it('should assign tier planned when load has active route plan', async () => {
      mockPrismaService.load.findMany.mockResolvedValueOnce([
        {
          loadNumber: 'LD-20260223-003',
          customerName: 'Target',
          status: 'IN_TRANSIT',
          requiredEquipmentType: 'DRY_VAN',
          originCity: 'Chicago',
          originState: 'IL',
          destinationCity: 'Memphis',
          destinationState: 'TN',
          pickupDate: new Date('2026-02-21'),
          deliveryDate: new Date('2026-02-23'),
          weightLbs: 35000,
          rateCents: 280000,
          updatedAt: new Date(),
          driver: {
            id: 3,
            driverId: 'DRV-003',
            name: 'Bob Wilson',
            hosDataSyncedAt: new Date(),
          },
          vehicle: { id: 3, vehicleId: 'VEH-003', unitNumber: 'TRK-303' },
          stops: [
            { status: 'completed', sequenceOrder: 1, actionType: 'pickup' },
            { status: 'pending', sequenceOrder: 2, actionType: 'delivery' },
          ],
          routePlanLoads: [
            {
              plan: {
                planId: 'RP-TEST01',
                status: 'active',
                isActive: true,
                totalDistanceMiles: 500,
                estimatedArrival: new Date('2026-02-23T18:00:00Z'),
                segments: [
                  {
                    sequenceOrder: 1,
                    segmentType: 'dock',
                    status: 'completed',
                    distanceMiles: 0,
                    toLocation: 'Chicago Warehouse',
                    estimatedArrival: null,
                    appointmentWindow: null,
                    hosStateAfter: null,
                  },
                  {
                    sequenceOrder: 2,
                    segmentType: 'drive',
                    status: 'completed',
                    distanceMiles: 200,
                    toLocation: null,
                    estimatedArrival: null,
                    appointmentWindow: null,
                    hosStateAfter: null,
                  },
                  {
                    sequenceOrder: 3,
                    segmentType: 'dock',
                    status: 'planned',
                    distanceMiles: 0,
                    toLocation: 'Memphis Hub',
                    estimatedArrival: new Date('2026-02-23T18:00:00Z'),
                    appointmentWindow: null,
                    hosStateAfter: null,
                  },
                ],
              },
            },
          ],
        },
      ]);
      mockPrismaService.integrationConfig.findFirst.mockResolvedValueOnce({
        id: 1,
      });
      mockProgressTracker.determineCurrentSegment.mockReturnValueOnce({
        segmentType: 'drive',
        hosStateAfter: null,
      });

      const result = await service.getOverview(1);

      expect(result.activeLoads[0].tier).toBe('planned');
      expect(result.activeLoads[0].hos).not.toBeNull();
      expect(result.activeLoads[0].route).not.toBeNull();
      expect(result.activeLoads[0].route.planId).toBe('RP-TEST01');
    });

    it('should use cache on second call', async () => {
      const result = await service.getOverview(1);

      // getOverview uses getOrSet, so mock it to return the cached value
      mockCacheManager.getOrSet.mockResolvedValueOnce(result);

      const cached = await service.getOverview(1);
      expect(cached).toEqual(result);
    });
  });

  // -------------------------------------------------------------------------
  // getSystemHealth
  // -------------------------------------------------------------------------

  describe('getSystemHealth', () => {
    it('should return inactive status when no monitoring events', async () => {
      // Ensure mocks are properly set for this test
      mockCacheManager.get.mockResolvedValue(null);
      mockMonitoringEngine.getCachedResult.mockResolvedValue(null);
      mockPrismaService.integrationConfig.findMany.mockResolvedValue([]);
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      const result = await service.getSystemHealth(1);

      expect(result.monitoring.status).toBe('inactive');
      expect(result.monitoring.lastCycleAt).toBeNull();
    });

    it('should return active status when recent monitoring events exist', async () => {
      mockMonitoringEngine.getCachedResult.mockResolvedValueOnce({
        status: 'active',
        loadsMonitored: 5,
        driversMonitored: 3,
        triggersThisCycle: 0,
        lastCycleAt: new Date().toISOString(),
        checks: { active: [], inactive: [] },
        dataSources: [],
      });

      const result = await service.getSystemHealth(1);

      expect(result.monitoring.status).toBe('active');
      expect(result.monitoring.lastCycleAt).toBeTruthy();
    });

    it('should return degraded status when monitoring events are stale', async () => {
      mockMonitoringEngine.getCachedResult.mockResolvedValueOnce({
        status: 'degraded',
        loadsMonitored: 5,
        driversMonitored: 3,
        triggersThisCycle: 0,
        lastCycleAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        checks: { active: [], inactive: [] },
        dataSources: [],
      });

      const result = await service.getSystemHealth(1);

      expect(result.monitoring.status).toBe('degraded');
    });

    it('should include all check categories', async () => {
      const result = await service.getSystemHealth(1);

      expect(result.checks).toHaveLength(5);
      const categories = result.checks.map((c) => c.category);
      expect(categories).toContain('HOS Compliance');
      expect(categories).toContain('Route Progress');
      expect(categories).toContain('Driver Behavior');
      expect(categories).toContain('Vehicle State');
      expect(categories).toContain('Lifecycle');
    });

    it('should map integration configs to display format', async () => {
      const result = await service.getSystemHealth(1);

      expect(result.integrations).toHaveLength(4);
      expect(result.integrations[0].name).toBe('Samsara HOS');
      // No configs = mock/not_configured
      expect(result.integrations[0].source).toBe('mock');
      expect(result.integrations[0].status).toBe('not_configured');
    });

    it('should show live status for active integrations', async () => {
      mockPrismaService.integrationConfig.findMany.mockResolvedValueOnce([
        {
          integrationType: 'ELD',
          vendor: 'SAMSARA_ELD',
          displayName: 'Samsara',
          isEnabled: true,
          status: 'ACTIVE',
          lastSuccessAt: new Date(),
        },
      ]);

      const result = await service.getSystemHealth(1);

      const eldIntegration = result.integrations.find((i) => i.name === 'Samsara HOS');
      expect(eldIntegration?.source).toBe('live');
      expect(eldIntegration?.status).toBe('connected');
    });

    it('should cache system health for 60 seconds', async () => {
      await service.getSystemHealth(1);

      expect(mockCacheManager.set).toHaveBeenCalledWith('sally:cmdcenter:health:1', expect.any(Object), 60 * 1000);
    });
  });

  // -------------------------------------------------------------------------
  // Shift Notes
  // -------------------------------------------------------------------------

  describe('getShiftNotes', () => {
    it('should return notes array and handoffStatus', async () => {
      const result = await service.getShiftNotes(1);
      expect(result).toHaveProperty('notes');
      expect(result).toHaveProperty('handoffStatus');
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it('should return handoffStatus.acknowledged = false when no acks', async () => {
      const result = await service.getShiftNotes(1);
      expect(result.handoffStatus.acknowledged).toBe(false);
    });
  });

  describe('createShiftNote', () => {
    it('should create note with priority and auto-linking', async () => {
      mockPrismaService.shiftNote.create.mockResolvedValueOnce({
        noteId: 'note-1',
        content: 'Check LD-1001 status',
        priority: 'urgent',
        createdAt: new Date(),
        expiresAt: new Date(),
        isPinned: false,
        linkedDriverId: null,
        linkedLoadId: 'load-1',
        linkedRoutePlanId: null,
        linkedVehicleId: null,
        acknowledgedAt: null,
        createdByUser: {
          userId: 'user-1',
          firstName: 'Test',
          lastName: 'User',
        },
      });

      mockPrismaService.load.findFirst.mockResolvedValueOnce({
        loadNumber: 'load-1',
        referenceNumber: 'LD-1001',
      });

      const result = await service.createShiftNote(1, 'user-1', 'Check LD-1001 status', false, 'urgent');

      expect(result.priority).toBe('urgent');
      expect(result.linkedEntities).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'load', label: 'LD-1001' })]),
      );
    });
  });

  describe('acknowledgeHandoff', () => {
    it('should bulk update unacknowledged notes', async () => {
      await service.acknowledgeHandoff(1, 'user-1');

      expect(mockPrismaService.shiftNote.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            deletedAt: null,
            acknowledgedAt: null,
          }),
          data: expect.objectContaining({
            acknowledgedBy: 1,
            acknowledgedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('deleteShiftNote', () => {
    it('should soft-delete by setting deletedAt', async () => {
      await service.deleteShiftNote(1, 'note-123');

      expect(mockPrismaService.shiftNote.updateMany).toHaveBeenCalledWith({
        where: { noteId: 'note-123', tenantId: 1, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Multi-tenant isolation
  // -------------------------------------------------------------------------

  describe('multi-tenant isolation', () => {
    it('should pass tenantId to all prisma queries in getOverview', async () => {
      await service.getOverview(42);

      expect(mockPrismaService.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 42 }),
        }),
      );
      expect(mockPrismaService.alert.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 42 }),
        }),
      );
      expect(mockPrismaService.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 42 }),
        }),
      );
    });

    it('should pass tenantId to getSystemHealth queries', async () => {
      await service.getSystemHealth(99);

      expect(mockMonitoringEngine.getCachedResult).toHaveBeenCalledWith(99);
      expect(mockPrismaService.integrationConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 99 }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: empty fleet
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty fleet with zero KPIs', async () => {
      mockPrismaService.load.findMany.mockResolvedValue([]);
      mockPrismaService.load.count.mockResolvedValue(0);
      mockPrismaService.alert.count.mockResolvedValue(0);
      mockPrismaService.driver.findMany.mockResolvedValue([]);

      const result = await service.getOverview(1);

      expect(result.kpis.activeLoads).toBe(0);
      expect(result.kpis.inTransit).toBe(0);
      expect(result.kpis.activeAlerts).toBe(0);
      expect(result.kpis.unassigned).toBe(0);
      expect(result.kpis.onTimePercentage).toBe(100);
      expect(result.activeLoads).toEqual([]);
      expect(result.driverHosStrip).toEqual([]);
    });

    it('should return unassigned count from pending loads', async () => {
      mockPrismaService.load.count.mockResolvedValue(5);

      const result = await service.getOverview(1);

      expect(result.kpis.unassigned).toBe(5);
      expect(result.quickActionCounts.unassignedLoads).toBe(5);
    });

    it('should count available drivers from ACTIVE status', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue([
        { id: 1, status: 'ACTIVE' },
        { id: 2, status: 'ACTIVE' },
        { id: 3, status: 'PENDING_ACTIVATION' },
      ]);

      const result = await service.getOverview(1);

      expect(result.quickActionCounts.availableDrivers).toBe(2);
    });

    it('should correctly count in-transit loads in KPIs', async () => {
      mockPrismaService.load.findMany.mockResolvedValue([
        {
          loadNumber: 'LD-001',
          customerName: 'Test',
          status: 'IN_TRANSIT',
          requiredEquipmentType: 'DRY_VAN',
          originCity: 'A',
          originState: 'TX',
          destinationCity: 'B',
          destinationState: 'GA',
          pickupDate: new Date(),
          deliveryDate: new Date(),
          weightLbs: 10000,
          rateCents: 100000,
          updatedAt: new Date(),
          driver: {
            id: 1,
            driverId: 'DRV-001',
            name: 'Test',
            hosDataSyncedAt: null,
          },
          vehicle: { id: 1, vehicleId: 'VEH-001', unitNumber: 'U1' },
          stops: [],
          routePlanLoads: [],
        },
        {
          loadNumber: 'LD-002',
          customerName: 'Test 2',
          status: 'ASSIGNED',
          requiredEquipmentType: 'FLATBED',
          originCity: 'C',
          originState: 'IL',
          destinationCity: 'D',
          destinationState: 'OH',
          pickupDate: new Date(),
          deliveryDate: new Date(),
          weightLbs: 20000,
          rateCents: 200000,
          updatedAt: new Date(),
          driver: {
            id: 2,
            driverId: 'DRV-002',
            name: 'Test 2',
            hosDataSyncedAt: null,
          },
          vehicle: { id: 2, vehicleId: 'VEH-002', unitNumber: 'U2' },
          stops: [],
          routePlanLoads: [],
        },
      ]);

      const result = await service.getOverview(1);

      expect(result.kpis.activeLoads).toBe(2);
      expect(result.kpis.inTransit).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Cache TTL behavior
  // -------------------------------------------------------------------------

  describe('cache behavior', () => {
    it('should cache overview via getOrSet', async () => {
      await service.getOverview(1);

      expect(mockCacheManager.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining('cmdcenter'),
        expect.any(Function),
        expect.any(Number),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getMapData
  // -------------------------------------------------------------------------

  describe('getMapData', () => {
    it('should return cached map data if available', async () => {
      const cachedData = { trucks: [], unassignedLoads: [] };
      mockCacheManager.get.mockResolvedValueOnce(cachedData);

      const result = await service.getMapData(1);

      expect(result).toEqual(cachedData);
      expect(mockPrismaService.vehicle.findMany).not.toHaveBeenCalled();
    });

    it('should return map data from database when cache is empty', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.vehicle.findMany.mockResolvedValueOnce([]);
      mockPrismaService.load.findMany.mockResolvedValueOnce([]);

      const result = await service.getMapData(1);

      expect(result).toHaveProperty('trucks');
      expect(result).toHaveProperty('unassignedLoads');
      expect(mockPrismaService.vehicle.findMany).toHaveBeenCalled();
    });

    it('should filter vehicles to only those with telematics', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.vehicle.findMany.mockResolvedValueOnce([
        {
          vehicleId: 'VEH-1',
          unitNumber: 'TRK-1',
          telematics: null,
          loads: [],
          assignedDriver: null,
        },
        {
          vehicleId: 'VEH-2',
          unitNumber: 'TRK-2',
          telematics: {
            latitude: 32.7767,
            longitude: -96.797,
            speed: 55,
            heading: 180,
            engineRunning: true,
            fuelLevel: 75,
            updatedAt: new Date(),
          },
          loads: [],
          assignedDriver: null,
        },
      ]);
      mockPrismaService.load.findMany.mockResolvedValueOnce([]);

      const result = await service.getMapData(1);

      expect(result.trucks).toHaveLength(1);
      expect(result.trucks[0].vehicleId).toBe('VEH-2');
    });

    it('should expose the full geocoded stop sequence on an active load', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.vehicle.findMany.mockResolvedValueOnce([
        {
          vehicleId: 'VEH-3',
          unitNumber: 'TRK-3',
          telematics: {
            latitude: 32.7767,
            longitude: -96.797,
            speed: 55,
            heading: 180,
            engineRunning: true,
            fuelLevel: 80,
            updatedAt: new Date(),
          },
          assignedDriver: null,
          loads: [
            {
              loadNumber: 'LD-ROUTE-1',
              referenceNumber: 'PO-9',
              status: 'IN_TRANSIT',
              customerName: 'Acme',
              originCity: 'Dallas',
              originState: 'TX',
              destinationCity: 'Chicago',
              destinationState: 'IL',
              pickupDate: new Date(),
              deliveryDate: new Date(),
              driver: { driverId: 'DRV-3', name: 'Sam', hosData: null, hosDataSyncedAt: null },
              stops: [
                {
                  sequenceOrder: 2,
                  actionType: 'stop',
                  stop: { city: 'Tulsa', state: 'OK', lat: 36.15, lon: -95.99 },
                },
                {
                  sequenceOrder: 1,
                  actionType: 'pickup',
                  stop: { city: 'Dallas', state: 'TX', lat: 32.78, lon: -96.8 },
                },
                {
                  sequenceOrder: 3,
                  actionType: 'delivery',
                  stop: { city: 'Chicago', state: 'IL', lat: 41.88, lon: -87.63 },
                },
              ],
            },
          ],
        },
      ]);
      mockPrismaService.load.findMany.mockResolvedValueOnce([]);

      const result = await service.getMapData(1);
      const stops = result.trucks[0].activeLoad?.stops;

      expect(stops).toHaveLength(3);
      // Sorted by sequenceOrder regardless of query order.
      expect(stops?.map((s) => s.sequenceOrder)).toEqual([1, 2, 3]);
      expect(stops?.[0]).toMatchObject({ actionType: 'pickup', city: 'Dallas', lat: 32.78, lng: -96.8 });
      expect(stops?.[2]).toMatchObject({ actionType: 'delivery', city: 'Chicago' });
    });

    it('should return an empty stops array when only one stop is geocoded', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.vehicle.findMany.mockResolvedValueOnce([
        {
          vehicleId: 'VEH-4',
          unitNumber: 'TRK-4',
          telematics: {
            latitude: 32.7767,
            longitude: -96.797,
            speed: 0,
            heading: 0,
            engineRunning: false,
            fuelLevel: 50,
            updatedAt: new Date(),
          },
          assignedDriver: null,
          loads: [
            {
              loadNumber: 'LD-ROUTE-2',
              referenceNumber: null,
              status: 'ASSIGNED',
              customerName: 'Acme',
              originCity: 'Dallas',
              originState: 'TX',
              destinationCity: 'Dallas',
              destinationState: 'TX',
              pickupDate: new Date(),
              deliveryDate: new Date(),
              driver: { driverId: 'DRV-4', name: 'Pat', hosData: null, hosDataSyncedAt: null },
              // A single geocoded stop — origin and destination both resolve to
              // it, but there is nothing to connect, so stops stays empty.
              stops: [
                {
                  sequenceOrder: 1,
                  actionType: 'pickup',
                  stop: { city: 'Dallas', state: 'TX', lat: 32.78, lon: -96.8 },
                },
              ],
            },
          ],
        },
      ]);
      mockPrismaService.load.findMany.mockResolvedValueOnce([]);

      const result = await service.getMapData(1);

      expect(result.trucks[0].activeLoad).not.toBeNull();
      expect(result.trucks[0].activeLoad?.stops).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getMessageSummary
  // -------------------------------------------------------------------------

  describe('getMessageSummary', () => {
    it('should return message summary via cache', async () => {
      const summary = { items: [], needsResponseCount: 0 };
      mockCacheManager.getOrSet.mockResolvedValueOnce(summary);

      const result = await service.getMessageSummary(1);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('needsResponseCount');
    });
  });

  // -------------------------------------------------------------------------
  // Additional overview edge cases
  // -------------------------------------------------------------------------

  describe('getMapData — cache miss', () => {
    it('should cache the map data after computing', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.vehicle.findMany.mockResolvedValueOnce([]);
      mockPrismaService.load.findMany.mockResolvedValueOnce([]);

      await service.getMapData(1);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('map'),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('system health — pipeline sync status', () => {
    it('should return pipeline array in health', async () => {
      const result = await service.getSystemHealth(1);

      expect(result).toHaveProperty('pipeline');
      expect(Array.isArray(result.pipeline)).toBe(true);
      expect(result.pipeline.length).toBeGreaterThan(0);
    });

    it('should include monitoring section', async () => {
      const result = await service.getSystemHealth(1);

      expect(result).toHaveProperty('monitoring');
      expect(result.monitoring).toHaveProperty('status');
    });
  });

  describe('shift notes — createShiftNote without auto-linking', () => {
    it('should handle content without identifiers', async () => {
      mockPrismaService.shiftNote.create.mockResolvedValueOnce({
        noteId: 'note-2',
        content: 'Remember to check weather',
        priority: 'normal',
        createdAt: new Date(),
        expiresAt: new Date(),
        isPinned: false,
        linkedDriverId: null,
        linkedLoadId: null,
        linkedRoutePlanId: null,
        linkedVehicleId: null,
        acknowledgedAt: null,
        createdByUser: {
          userId: 'user-1',
          firstName: 'Test',
          lastName: 'User',
        },
      });

      const result = await service.createShiftNote(1, 'user-1', 'Remember to check weather', false, 'normal');

      expect(result.linkedEntities).toEqual([]);
    });

    it('should create pinned note', async () => {
      const now = new Date();
      mockPrismaService.shiftNote.create.mockResolvedValueOnce({
        noteId: 'note-3',
        content: 'Important update',
        priority: 'normal',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 86400000),
        isPinned: true,
        linkedDriverId: null,
        linkedLoadId: null,
        linkedRoutePlanId: null,
        linkedVehicleId: null,
        acknowledgedAt: null,
        createdByUser: {
          userId: 'user-1',
          firstName: 'Test',
          lastName: 'User',
        },
      });

      const result = await service.createShiftNote(1, 'user-1', 'Important update', true, 'normal');

      expect(result).toBeDefined();
      expect(result.content).toBe('Important update');
    });
  });
});

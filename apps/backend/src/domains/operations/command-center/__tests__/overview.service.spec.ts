import { Test, TestingModule } from '@nestjs/testing';
import { AlertPriority } from '@prisma/client';
import { OverviewService } from '../services/overview.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { RouteProgressTrackerService } from '../../monitoring/services/route-progress-tracker.service';

describe('OverviewService', () => {
  const TENANT_ID = 1;

  const buildLoad = (overrides: Partial<any> = {}) => ({
    id: 501,
    loadNumber: 'L-1001',
    customerName: 'Acme Co',
    status: 'IN_TRANSIT',
    isActive: true,
    originCity: 'Dallas',
    originState: 'TX',
    destinationCity: 'Atlanta',
    destinationState: 'GA',
    pickupDate: null,
    deliveryDate: null,
    weightLbs: 40000,
    rateCents: 200000,
    referenceNumber: null,
    updatedAt: new Date('2026-04-30T00:00:00Z'),
    driver: {
      id: 1,
      driverId: 'D-001',
      name: 'Jane Doe',
      hosData: null,
      hosDataSyncedAt: null,
    },
    vehicle: { id: 1, vehicleId: 'V-001', unitNumber: '101' },
    stops: [],
    routePlanLoads: [],
    ...overrides,
  });

  const buildHarness = (priorityRows: { loadId: string; priority: AlertPriority }[]) => {
    const load = buildLoad();
    // Phase 2 Task 10 — alert.loadId is the Int FK to loads.id. The
    // groupBy mock returns the load's Int id; the service translates back
    // to loadNumber via the loads-fetched map.
    const prisma: any = {
      load: {
        findMany: jest.fn().mockResolvedValue([load]),
        count: jest.fn().mockResolvedValue(0),
      },
      integrationConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      alert: {
        count: jest.fn().mockResolvedValue(priorityRows.length),
        groupBy: jest.fn().mockImplementation(({ by }: { by: string[] }) => {
          // alertsByLoad
          if (by.length === 1 && by[0] === 'loadId') {
            return Promise.resolve([{ loadId: load.id, _count: priorityRows.length }]);
          }
          // alertsByDriver
          if (by.length === 1 && by[0] === 'driverId') {
            return Promise.resolve([]);
          }
          // alertPriorityByLoad — priorityRows.loadId is the load.id Int FK
          // for this test harness (all fixtures use the same load).
          if (by.length === 2 && by.includes('loadId') && by.includes('priority')) {
            return Promise.resolve(priorityRows.map((row) => ({ loadId: load.id, priority: row.priority, _count: 1 })));
          }
          // alertPriorityByDriver
          return Promise.resolve([]);
        }),
      },
      driver: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const cache: Pick<SallyCacheService, 'getOrSet'> = {
      getOrSet: jest.fn(<T>(_key: string, factory: () => Promise<T>) => factory()),
    };

    const progressTracker: Pick<RouteProgressTrackerService, 'determineCurrentSegment'> = {
      determineCurrentSegment: jest.fn().mockReturnValue(null),
    };

    return { prisma, cache, progressTracker, load };
  };

  const buildService = async (harness: ReturnType<typeof buildHarness>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverviewService,
        { provide: PrismaService, useValue: harness.prisma },
        { provide: SallyCacheService, useValue: harness.cache },
        { provide: RouteProgressTrackerService, useValue: harness.progressTracker },
      ],
    }).compile();

    return module.get(OverviewService);
  };

  describe('monitoringStatus (worstPriority)', () => {
    it('returns "critical" when load has a CRITICAL alert', async () => {
      const harness = buildHarness([{ loadId: 'L-1001', priority: AlertPriority.CRITICAL }]);
      const service = await buildService(harness);

      const overview = await service.getOverview(TENANT_ID);

      expect(overview.activeLoads).toHaveLength(1);
      expect(overview.activeLoads[0].monitoringStatus).toBe('critical');
    });

    it('returns "critical" when load has a HIGH alert', async () => {
      const harness = buildHarness([{ loadId: 'L-1001', priority: AlertPriority.HIGH }]);
      const service = await buildService(harness);

      const overview = await service.getOverview(TENANT_ID);

      expect(overview.activeLoads[0].monitoringStatus).toBe('critical');
    });

    it('returns "warning" when load has only a MEDIUM alert', async () => {
      const harness = buildHarness([{ loadId: 'L-1001', priority: AlertPriority.MEDIUM }]);
      const service = await buildService(harness);

      const overview = await service.getOverview(TENANT_ID);

      expect(overview.activeLoads[0].monitoringStatus).toBe('warning');
    });

    it('returns "ok" when load has only a LOW alert', async () => {
      const harness = buildHarness([{ loadId: 'L-1001', priority: AlertPriority.LOW }]);
      const service = await buildService(harness);

      const overview = await service.getOverview(TENANT_ID);

      expect(overview.activeLoads[0].monitoringStatus).toBe('ok');
    });

    it('picks worst priority when load has mixed alerts', async () => {
      const harness = buildHarness([
        { loadId: 'L-1001', priority: AlertPriority.LOW },
        { loadId: 'L-1001', priority: AlertPriority.CRITICAL },
        { loadId: 'L-1001', priority: AlertPriority.MEDIUM },
      ]);
      const service = await buildService(harness);

      const overview = await service.getOverview(TENANT_ID);

      expect(overview.activeLoads[0].monitoringStatus).toBe('critical');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { RoutePlanProgressService } from '../route-plan-progress.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { IntegrationDataService } from '../../../../integrations/services/integration-data.service';
import { createMockPrisma } from '../../../../../test/mocks';

describe('RoutePlanProgressService', () => {
  let service: RoutePlanProgressService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let integrationDataService: { getVehicleLocation: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    integrationDataService = {
      getVehicleLocation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutePlanProgressService,
        { provide: PrismaService, useValue: prisma },
        { provide: IntegrationDataService, useValue: integrationDataService },
      ],
    }).compile();

    service = module.get<RoutePlanProgressService>(RoutePlanProgressService);
  });

  afterEach(() => jest.clearAllMocks());

  const makeActivePlan = (segments: any[] = [], vehicleOverrides?: any) => ({
    id: 1,
    isActive: true,
    tenantId: 1,
    vehicle: {
      id: 1,
      externalVehicleId: 'ext-v1',
      externalSource: 'SAMSARA_ELD',
      ...vehicleOverrides,
    },
    driver: { id: 1 },
    segments,
  });

  const makeDriveSegment = (overrides?: any) => ({
    id: 10,
    segmentId: 'seg-drive-1',
    segmentType: 'drive',
    sequenceOrder: 1,
    status: 'IN_PROGRESS',
    fromLat: 32.78,
    fromLon: -96.8,
    toLat: 33.75,
    toLon: -84.39,
    distanceMiles: 780,
    ...overrides,
  });

  const makeDockSegment = (overrides?: any) => ({
    id: 20,
    segmentId: 'seg-dock-1',
    segmentType: 'dock',
    sequenceOrder: 2,
    status: 'PLANNED',
    toLat: 33.75,
    toLon: -84.39,
    ...overrides,
  });

  // ─── Early exits ─────────────────────────────────────────────────────────

  describe('early exits', () => {
    it('should return early when plan not found', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(null);

      await service.updateProgress(999);

      expect(integrationDataService.getVehicleLocation).not.toHaveBeenCalled();
    });

    it('should return early when plan is not active', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({
        ...makeActivePlan(),
        isActive: false,
      });

      await service.updateProgress(1);

      expect(integrationDataService.getVehicleLocation).not.toHaveBeenCalled();
    });

    it('should return early when vehicle has no externalVehicleId', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([], { externalVehicleId: null }));

      await service.updateProgress(1);

      expect(integrationDataService.getVehicleLocation).not.toHaveBeenCalled();
    });

    it('should return early when no telematics data available', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([makeDriveSegment()]));
      integrationDataService.getVehicleLocation.mockResolvedValue(null);

      await service.updateProgress(1);

      expect(prisma.routeSegment.update).not.toHaveBeenCalled();
    });
  });

  // ─── Drive progress tracking ─────────────────────────────────────────────

  describe('drive progress tracking', () => {
    it('should update progress for in-progress drive segment', async () => {
      const seg = makeDriveSegment();
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([seg]));
      integrationDataService.getVehicleLocation.mockResolvedValue({
        latitude: 33.0,
        longitude: -90.0,
        speed: 60,
      });
      prisma.routeSegment.update.mockResolvedValue({});
      // No recent progress event (throttle)
      prisma.routeEvent.findFirst.mockResolvedValue(null);
      prisma.routeEvent.create.mockResolvedValue({});

      await service.updateProgress(1);

      expect(prisma.routeSegment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: seg.id },
          data: expect.objectContaining({
            progress: expect.any(Number),
            milesDriven: expect.any(Number),
            milesRemaining: expect.any(Number),
          }),
        }),
      );
    });

    it('should not update progress for planned (not in_progress) drive segment', async () => {
      const seg = makeDriveSegment({ status: 'PLANNED' });
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([seg]));
      integrationDataService.getVehicleLocation.mockResolvedValue({
        latitude: 33.0,
        longitude: -90.0,
        speed: 60,
      });

      await service.updateProgress(1);

      expect(prisma.routeSegment.update).not.toHaveBeenCalled();
    });
  });

  // ─── Arrival detection ───────────────────────────────────────────────────

  describe('arrival detection', () => {
    it('should transition to completed when driver arrives near stop', async () => {
      const driveSeg = makeDriveSegment({ status: 'IN_PROGRESS' });
      const dockSeg = makeDockSegment();
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([driveSeg, dockSeg]));
      // Vehicle is at the dock location (within 1 mile)
      integrationDataService.getVehicleLocation.mockResolvedValue({
        latitude: 33.75,
        longitude: -84.39,
        speed: 0,
      });
      prisma.routeSegment.update.mockResolvedValue({});
      prisma.routeEvent.findFirst.mockResolvedValue(null);
      prisma.routeEvent.create.mockResolvedValue({});

      await service.updateProgress(1);

      // Should have created route events for arrival
      expect(prisma.routeEvent.create).toHaveBeenCalled();
    });
  });

  // ─── Departure detection ─────────────────────────────────────────────────

  describe('departure detection', () => {
    it('should complete dock segment when driver starts moving', async () => {
      const dockSeg = makeDockSegment({
        status: 'IN_PROGRESS',
        sequenceOrder: 1,
      });
      const nextDriveSeg = makeDriveSegment({
        status: 'PLANNED',
        sequenceOrder: 2,
        id: 30,
        segmentId: 'seg-drive-2',
      });
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([dockSeg, nextDriveSeg]));
      // Vehicle moving above threshold (5 mph)
      integrationDataService.getVehicleLocation.mockResolvedValue({
        latitude: 33.76,
        longitude: -84.38,
        speed: 55,
      });
      prisma.routeSegment.update.mockResolvedValue({});
      prisma.routeEvent.create.mockResolvedValue({});

      await service.updateProgress(1);

      // Should have completed dock segment and started next
      expect(prisma.routeSegment.update).toHaveBeenCalled();
      expect(prisma.routeEvent.create).toHaveBeenCalled();
    });
  });

  // ─── Progress event throttling ───────────────────────────────────────────

  describe('progress event throttling', () => {
    it('should skip progress event when last one was recent', async () => {
      const seg = makeDriveSegment();
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([seg]));
      integrationDataService.getVehicleLocation.mockResolvedValue({
        latitude: 33.0,
        longitude: -90.0,
        speed: 60,
      });
      prisma.routeSegment.update.mockResolvedValue({});
      // Last progress event was 5 minutes ago (within 10-min throttle)
      prisma.routeEvent.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      });

      await service.updateProgress(1);

      // Segment updated, but no new progress event
      expect(prisma.routeSegment.update).toHaveBeenCalled();
      // routeEvent.create should only be called if not throttled
      // Since we also have segment transitions, let's check the PROGRESS_UPDATE call
      const createCalls = prisma.routeEvent.create.mock.calls;
      const progressUpdates = createCalls.filter((c) => c[0]?.data?.eventType === 'PROGRESS_UPDATE');
      expect(progressUpdates).toHaveLength(0);
    });

    it('should create progress event when throttle window passed', async () => {
      const seg = makeDriveSegment();
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([seg]));
      integrationDataService.getVehicleLocation.mockResolvedValue({
        latitude: 33.0,
        longitude: -90.0,
        speed: 60,
      });
      prisma.routeSegment.update.mockResolvedValue({});
      // Last progress event was 15 minutes ago (past 10-min throttle)
      prisma.routeEvent.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 15 * 60 * 1000),
      });
      prisma.routeEvent.create.mockResolvedValue({});

      await service.updateProgress(1);

      expect(prisma.routeEvent.create).toHaveBeenCalled();
    });
  });

  // ─── No active segment ───────────────────────────────────────────────────

  describe('no active segment', () => {
    it('should do nothing when all segments are completed', async () => {
      const completedSeg = makeDriveSegment({ status: 'COMPLETED' });
      prisma.routePlan.findUnique.mockResolvedValue(makeActivePlan([completedSeg]));
      integrationDataService.getVehicleLocation.mockResolvedValue({
        latitude: 33.0,
        longitude: -90.0,
        speed: 60,
      });

      await service.updateProgress(1);

      expect(prisma.routeSegment.update).not.toHaveBeenCalled();
    });
  });
});

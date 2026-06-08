import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RoutePlanPersistenceService, CreatePlanData } from '../route-plan-persistence.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks';
import { makeRoutePlan } from '../../../../../test/factories';
import { LoadLegService } from '../../../../fleet/loads/services/load-leg.service';

describe('RoutePlanPersistenceService', () => {
  let service: RoutePlanPersistenceService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutePlanPersistenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: LoadLegService, useValue: { getActiveLeg: jest.fn() } },
      ],
    }).compile();

    service = module.get<RoutePlanPersistenceService>(RoutePlanPersistenceService);
  });

  afterEach(() => jest.clearAllMocks());

  const basePlanData: CreatePlanData = {
    planId: 'RP-20260302-ABC123',
    driverId: 1,
    vehicleId: 1,
    tenantId: 1,
    status: 'DRAFT',
    optimizationPriority: 'minimize_time',
    totalDistanceMiles: 780,
    totalDriveTimeHours: 12.5,
    totalOnDutyTimeHours: 14,
    totalCostEstimate: 1200,
    totalTripTimeHours: 16,
    totalDrivingDays: 1,
    isFeasible: true,
    segments: [
      {
        segmentId: 'seg-1',
        sequenceOrder: 1,
        segmentType: 'drive',
        distanceMiles: 400,
        driveTimeHours: 6,
      },
      {
        segmentId: 'seg-2',
        sequenceOrder: 2,
        segmentType: 'rest',
        restDurationHours: 10,
        restType: 'full',
      },
    ],
    loadIds: [10, 20],
  };

  // ─── createPlan ──────────────────────────────────────────────────────────

  describe('createPlan', () => {
    it('should create a plan with segments and load associations in a transaction', async () => {
      const createdPlan = makeRoutePlan({
        id: 1,
        planId: 'RP-20260302-ABC123',
      });
      prisma.routePlan.create.mockResolvedValue(createdPlan);
      prisma.routeSegment.create.mockResolvedValue({});
      prisma.routePlanLoad.create.mockResolvedValue({});
      prisma.routePlan.findUnique.mockResolvedValue({
        ...createdPlan,
        segments: [],
        loads: [],
      });

      const result = await service.createPlan(basePlanData);

      expect(result).toBeDefined();
      // Transaction was called
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should create segments in order', async () => {
      const createdPlan = makeRoutePlan({ id: 1 });
      prisma.routePlan.create.mockResolvedValue(createdPlan);
      prisma.routeSegment.create.mockResolvedValue({});
      prisma.routePlanLoad.create.mockResolvedValue({});
      prisma.routePlan.findUnique.mockResolvedValue(createdPlan);

      await service.createPlan(basePlanData);

      // 2 segment creates
      expect(prisma.routeSegment.create).toHaveBeenCalledTimes(2);
      const firstCall = prisma.routeSegment.create.mock.calls[0][0];
      expect(firstCall.data.segmentId).toBe('seg-1');
      expect(firstCall.data.sequenceOrder).toBe(1);
    });

    it('should create load associations for each loadId', async () => {
      const createdPlan = makeRoutePlan({ id: 1 });
      prisma.routePlan.create.mockResolvedValue(createdPlan);
      prisma.routeSegment.create.mockResolvedValue({});
      prisma.routePlanLoad.create.mockResolvedValue({});
      prisma.routePlan.findUnique.mockResolvedValue(createdPlan);

      await service.createPlan(basePlanData);

      expect(prisma.routePlanLoad.create).toHaveBeenCalledTimes(2);
      expect(prisma.routePlanLoad.create).toHaveBeenCalledWith({
        data: { planId: 1, loadId: 10 },
      });
      expect(prisma.routePlanLoad.create).toHaveBeenCalledWith({
        data: { planId: 1, loadId: 20 },
      });
    });
  });

  // ─── getPlanById ─────────────────────────────────────────────────────────

  describe('getPlanById', () => {
    it('should return plan with segments and loads', async () => {
      const mockPlan = makeRoutePlan({ planId: 'RP-TEST-001' });
      prisma.routePlan.findUnique.mockResolvedValue(mockPlan);

      const result = await service.getPlanById('RP-TEST-001');

      expect(result).toEqual(mockPlan);
      expect(prisma.routePlan.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { planId: 'RP-TEST-001' },
          include: expect.objectContaining({
            segments: expect.any(Object),
            loads: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(null);

      await expect(service.getPlanById('RP-NONEXISTENT')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getActivePlanForDriver ──────────────────────────────────────────────

  describe('getActivePlanForDriver', () => {
    it('should return the active plan for a driver', async () => {
      const mockPlan = makeRoutePlan({ isActive: true, driverId: 1 });
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);

      const result = await service.getActivePlanForDriver(1);

      expect(result).toEqual(mockPlan);
      expect(prisma.routePlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId: 1, isActive: true },
        }),
      );
    });

    it('should return null when no active plan exists', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(null);

      const result = await service.getActivePlanForDriver(1);

      expect(result).toBeNull();
    });
  });

  // ─── activatePlan ────────────────────────────────────────────────────────

  describe('activatePlan', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(null);

      await expect(service.activatePlan('RP-NONEXISTENT')).rejects.toThrow(NotFoundException);
    });

    it('should deactivate previous active plans for the same driver', async () => {
      const existingPlan = makeRoutePlan({
        id: 5,
        planId: 'RP-NEW',
        driverId: 1,
        loads: [{ load: { id: 10, loadNumber: 'ld-1', status: 'PENDING' } }],
      });
      prisma.routePlan.findUnique.mockResolvedValue(existingPlan);

      const previousActive = makeRoutePlan({
        id: 3,
        planId: 'RP-OLD',
        driverId: 1,
        isActive: true,
        loads: [{ load: { id: 9, loadNumber: 'ld-old', status: 'ASSIGNED' } }],
      });
      prisma.routePlan.findMany.mockResolvedValue([previousActive]);
      prisma.routePlan.update.mockResolvedValue({});
      prisma.load.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);

      const activatedPlan = {
        ...existingPlan,
        isActive: true,
        status: 'ACTIVE',
        driverId: 1,
        vehicleId: 1,
        loads: existingPlan.loads,
      };
      // The final update call returns activated plan
      prisma.routePlan.update.mockResolvedValue(activatedPlan);

      await service.activatePlan('RP-NEW');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for double-booked loads', async () => {
      const existingPlan = makeRoutePlan({
        id: 5,
        planId: 'RP-NEW',
        driverId: 1,
        loads: [{ load: { id: 10, loadNumber: 'ld-1', status: 'ASSIGNED' } }],
      });
      prisma.routePlan.findUnique.mockResolvedValue(existingPlan);

      // Another active plan already has this load
      prisma.routePlanLoad.findFirst.mockResolvedValue({
        plan: { planId: 'RP-OTHER' },
      });

      await expect(service.activatePlan('RP-NEW')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── cancelPlan ──────────────────────────────────────────────────────────

  describe('cancelPlan', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(null);

      await expect(service.cancelPlan('RP-NONEXISTENT')).rejects.toThrow(NotFoundException);
    });

    it('should set status to cancelled and deactivate', async () => {
      const plan = makeRoutePlan({
        id: 1,
        planId: 'RP-CANCEL',
        isActive: true,
        loads: [{ load: { id: 10, status: 'ASSIGNED' } }],
      });
      prisma.routePlan.findUnique.mockResolvedValue(plan);
      const cancelledPlan = { ...plan, status: 'CANCELLED', isActive: false };
      prisma.routePlan.update.mockResolvedValue(cancelledPlan);
      prisma.load.update.mockResolvedValue({});

      await service.cancelPlan('RP-CANCEL');

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── updateSegmentStatus ─────────────────────────────────────────────────

  describe('updateSegmentStatus', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(null);

      await expect(service.updateSegmentStatus('RP-X', 'seg-1', { status: 'IN_PROGRESS' }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for wrong tenant', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 2,
      });

      await expect(service.updateSegmentStatus('RP-X', 'seg-1', { status: 'IN_PROGRESS' }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when segment not found', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
      });
      prisma.routeSegment.findFirst.mockResolvedValue(null);

      await expect(service.updateSegmentStatus('RP-X', 'seg-bad', { status: 'IN_PROGRESS' }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject invalid status transition', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({ id: 1, tenantId: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({
        id: 10,
        status: 'IN_PROGRESS',
      });

      await expect(service.updateSegmentStatus('RP-X', 'seg-1', { status: 'PLANNED' }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow valid transition planned → in_progress', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({ id: 1, tenantId: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({
        id: 10,
        status: 'PLANNED',
      });
      prisma.routeSegment.update.mockResolvedValue({
        id: 10,
        status: 'IN_PROGRESS',
      });

      await service.updateSegmentStatus('RP-X', 'seg-1', { status: 'IN_PROGRESS' }, 1);

      expect(prisma.routeSegment.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'IN_PROGRESS' },
      });
    });
  });

  // ─── supersedePlan ───────────────────────────────────────────────────────

  describe('supersedePlan', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(null);

      await expect(service.supersedePlan('RP-OLD', 5)).rejects.toThrow(NotFoundException);
    });

    it('should mark plan as superseded and link to new plan', async () => {
      prisma.routePlan.findUnique.mockResolvedValue(makeRoutePlan({ planId: 'RP-OLD' }));
      prisma.routePlan.update.mockResolvedValue({});

      await service.supersedePlan('RP-OLD', 5);

      expect(prisma.routePlan.update).toHaveBeenCalledWith({
        where: { planId: 'RP-OLD' },
        data: {
          status: 'SUPERSEDED',
          isActive: false,
          supersededById: 5,
        },
      });
    });
  });

  // ─── activateNextLegPlan ──────────────────────────────────────────────

  describe('activateNextLegPlan', () => {
    it('should do nothing when current leg not found', async () => {
      prisma.loadLeg.findUnique.mockResolvedValue(null);

      await service.activateNextLegPlan(999);

      expect(prisma.loadLeg.findFirst).not.toHaveBeenCalled();
    });

    it('should do nothing when no next leg exists', async () => {
      prisma.loadLeg.findUnique.mockResolvedValue({
        id: 1,
        loadId: 10,
        sequence: 1,
        legId: 'leg-1',
      });
      prisma.loadLeg.findFirst.mockResolvedValue(null);

      await service.activateNextLegPlan(1);

      expect(prisma.routePlan.findUnique).not.toHaveBeenCalled();
    });

    it('should do nothing when next leg has no route plan', async () => {
      prisma.loadLeg.findUnique.mockResolvedValue({
        id: 1,
        loadId: 10,
        sequence: 1,
        legId: 'leg-1',
      });
      prisma.loadLeg.findFirst.mockResolvedValue({
        id: 2,
        legId: 'leg-2',
        routePlanId: null,
      });

      await service.activateNextLegPlan(1);

      expect(prisma.routePlan.findUnique).not.toHaveBeenCalled();
    });

    it('should do nothing when next leg plan is not draft', async () => {
      prisma.loadLeg.findUnique.mockResolvedValue({
        id: 1,
        loadId: 10,
        sequence: 1,
        legId: 'leg-1',
      });
      prisma.loadLeg.findFirst.mockResolvedValue({
        id: 2,
        legId: 'leg-2',
        routePlanId: 100,
      });
      prisma.routePlan.findUnique.mockResolvedValue({
        id: 100,
        planId: 'RP-NEXT',
        status: 'ACTIVE',
        isActive: true,
      });

      await service.activateNextLegPlan(1);

      expect(prisma.routePlan.update).not.toHaveBeenCalled();
    });

    it('should activate next leg plan when status is draft', async () => {
      prisma.loadLeg.findUnique.mockResolvedValue({
        id: 1,
        loadId: 10,
        sequence: 1,
        legId: 'leg-1',
      });
      prisma.loadLeg.findFirst.mockResolvedValue({
        id: 2,
        legId: 'leg-2',
        routePlanId: 100,
      });
      prisma.routePlan.findUnique.mockResolvedValue({
        id: 100,
        planId: 'RP-NEXT',
        status: 'DRAFT',
        isActive: false,
      });
      prisma.routePlan.update.mockResolvedValue({});
      prisma.loadLeg.update.mockResolvedValue({});

      await service.activateNextLegPlan(1);

      expect(prisma.routePlan.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          isActive: true,
          status: 'ACTIVE',
          activatedAt: expect.any(Date),
        },
      });
      expect(prisma.loadLeg.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: {
          status: 'ASSIGNED',
          assignedAt: expect.any(Date),
        },
      });
    });

    it('should use transaction client when provided', async () => {
      const txClient = {
        loadLeg: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            loadId: 10,
            sequence: 1,
            legId: 'leg-1',
          }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      await service.activateNextLegPlan(1, txClient);

      expect(txClient.loadLeg.findUnique).toHaveBeenCalled();
      expect(prisma.loadLeg.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── getPlanById relay detection ────────────────────────────────────────

  describe('getPlanById relay detection', () => {
    it('should detect relay plans and include sibling legs', async () => {
      const plan = makeRoutePlan({ id: 5, planId: 'RP-RELAY' });
      prisma.routePlan.findUnique.mockResolvedValue(plan);

      // loadLeg.findFirst returns relay leg
      prisma.loadLeg.findFirst.mockResolvedValue({
        id: 1,
        legId: 'leg-1',
        loadId: 10,
        sequence: 1,
        load: { isRelay: true },
      });

      // loadLeg.findMany returns all sibling legs
      prisma.loadLeg.findMany.mockResolvedValue([
        {
          id: 1,
          legId: 'leg-1',
          sequence: 1,
          routePlanId: 5,
          driver: { name: 'Driver 1', driverId: 'drv-1' },
          vehicle: { unitNumber: 'UNIT-1', vehicleId: 'veh-1' },
          originStop: { stop: {} },
          destStop: { stop: {} },
        },
        {
          id: 2,
          legId: 'leg-2',
          sequence: 2,
          routePlanId: null,
          driver: null,
          vehicle: null,
          originStop: { stop: {} },
          destStop: { stop: {} },
        },
      ]);

      // Mock the plan fetched for each leg
      prisma.routePlan.findUnique
        .mockResolvedValueOnce(plan) // First call: main plan
        .mockResolvedValueOnce({
          // Leg 1 plan
          id: 5,
          planId: 'RP-RELAY',
          totalDistanceMiles: 300,
          departureTime: new Date(),
          estimatedArrival: new Date(),
          segments: [],
          driver: {},
          vehicle: {},
        });

      const result = await service.getPlanById('RP-RELAY');

      expect(result).toHaveProperty('routeType', 'relay');
      expect(result).toHaveProperty('relayLegs');
      expect(result).toHaveProperty('currentLegId', 'leg-1');
    });

    it('should return standard plan when not a relay', async () => {
      const plan = makeRoutePlan({ id: 5, planId: 'RP-STANDARD' });
      prisma.routePlan.findUnique.mockResolvedValue(plan);
      prisma.loadLeg.findFirst.mockResolvedValue(null);

      const result = await service.getPlanById('RP-STANDARD');

      expect(result).not.toHaveProperty('routeType');
      expect(result).toEqual(plan);
    });
  });

  // ─── updateSegmentStatus with actual times ─────────────────────────────

  describe('updateSegmentStatus with actual times', () => {
    it('should set actualArrival and actualDeparture when provided', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({ id: 1, tenantId: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({
        id: 10,
        status: 'PLANNED',
      });
      prisma.routeSegment.update.mockResolvedValue({
        id: 10,
        status: 'COMPLETED',
      });

      await service.updateSegmentStatus(
        'RP-X',
        'seg-1',
        {
          status: 'COMPLETED',
          actualArrival: '2026-03-15T10:00:00Z',
          actualDeparture: '2026-03-15T11:00:00Z',
        },
        1,
      );

      expect(prisma.routeSegment.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          status: 'COMPLETED',
          actualArrival: new Date('2026-03-15T10:00:00Z'),
          actualDeparture: new Date('2026-03-15T11:00:00Z'),
        },
      });
    });

    it('should allow planned → skipped transition', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({ id: 1, tenantId: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({
        id: 10,
        status: 'PLANNED',
      });
      prisma.routeSegment.update.mockResolvedValue({
        id: 10,
        status: 'SKIPPED',
      });

      const result = await service.updateSegmentStatus('RP-X', 'seg-1', { status: 'SKIPPED' }, 1);

      expect(result.status).toBe('SKIPPED');
    });

    it('should allow in_progress → completed transition', async () => {
      prisma.routePlan.findUnique.mockResolvedValue({ id: 1, tenantId: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({
        id: 10,
        status: 'IN_PROGRESS',
      });
      prisma.routeSegment.update.mockResolvedValue({
        id: 10,
        status: 'COMPLETED',
      });

      const result = await service.updateSegmentStatus('RP-X', 'seg-1', { status: 'COMPLETED' }, 1);

      expect(result.status).toBe('COMPLETED');
    });
  });

  // ─── cancelPlan load reversion ──────────────────────────────────────────

  describe('cancelPlan load reversion', () => {
    it('should not revert in_transit loads when cancelling', async () => {
      const plan = makeRoutePlan({
        id: 1,
        planId: 'RP-CANCEL',
        isActive: true,
        loads: [{ load: { id: 10, status: 'IN_TRANSIT' } }, { load: { id: 11, status: 'ASSIGNED' } }],
      });
      prisma.routePlan.findUnique.mockResolvedValue(plan);
      prisma.routePlan.update.mockResolvedValue({
        ...plan,
        status: 'CANCELLED',
        isActive: false,
      });
      prisma.load.update.mockResolvedValue({});

      await service.cancelPlan('RP-CANCEL');

      // Should only revert the 'assigned' load
      expect(prisma.load.update).toHaveBeenCalledTimes(1);
      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: {
          status: 'PENDING',
          assignedAt: null,
          driverId: null,
          vehicleId: null,
        },
      });
    });
  });

  // ─── listPlans ───────────────────────────────────────────────────────────

  describe('listPlans', () => {
    it('should return paginated plans with total', async () => {
      const plans = [makeRoutePlan()];
      prisma.routePlan.findMany.mockResolvedValue(plans);
      prisma.routePlan.count.mockResolvedValue(1);

      const result = await service.listPlans({ tenantId: 1 });

      expect(result.plans).toEqual(plans);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should apply status filter with comma-separated values', async () => {
      prisma.routePlan.findMany.mockResolvedValue([]);
      prisma.routePlan.count.mockResolvedValue(0);

      await service.listPlans({ status: 'draft,active' });

      const call = prisma.routePlan.findMany.mock.calls[0][0];
      expect(call.where.status).toEqual({ in: ['draft', 'active'] });
    });

    it('should enforce tenant isolation via where clause', async () => {
      prisma.routePlan.findMany.mockResolvedValue([]);
      prisma.routePlan.count.mockResolvedValue(0);

      await service.listPlans({ tenantId: 42 });

      const call = prisma.routePlan.findMany.mock.calls[0][0];
      expect(call.where.tenantId).toBe(42);
    });
  });
});

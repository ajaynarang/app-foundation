import { Test, TestingModule } from '@nestjs/testing';
import { DriverEventService } from '../services/driver-event.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RouteEventService } from '../services/route-event.service';

describe('DriverEventService', () => {
  let service: DriverEventService;
  let mockPrisma: any;
  let mockRouteEventService: any;

  beforeEach(async () => {
    mockPrisma = {
      routeSegment: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      routePlan: { update: jest.fn().mockResolvedValue({}) },
      routePlanLoad: { findMany: jest.fn().mockResolvedValue([]) },
      load: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };
    mockRouteEventService = {
      recordEvent: jest.fn().mockResolvedValue({ eventId: 'EVT-test' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverEventService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RouteEventService, useValue: mockRouteEventService },
      ],
    }).compile();

    service = module.get(DriverEventService);
    jest.clearAllMocks();
  });

  describe('handleStartRoute', () => {
    const makePlan = (segments: any[]) => ({
      id: 1,
      planId: 'RP-001',
      segments,
    });

    it('should start first planned segment', async () => {
      const plan = makePlan([
        {
          id: 1,
          segmentId: 'seg-1',
          sequenceOrder: 1,
          status: 'PLANNED',
          segmentType: 'drive',
        },
        {
          id: 2,
          segmentId: 'seg-2',
          sequenceOrder: 2,
          status: 'PLANNED',
          segmentType: 'dock',
        },
      ]);

      const result = await service.handleStartRoute(plan, {}, 1);

      expect(result.status).toBe('started');
      expect(result.currentSegment).toBe('seg-1');
      expect(mockPrisma.routeSegment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
      expect(mockRouteEventService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ROUTE_STARTED',
          source: 'driver',
        }),
      );
    });

    it('should be idempotent if already started', async () => {
      const plan = makePlan([
        {
          id: 1,
          segmentId: 'seg-1',
          sequenceOrder: 1,
          status: 'IN_PROGRESS',
          segmentType: 'drive',
        },
      ]);

      const result = await service.handleStartRoute(plan, {}, 1);

      expect(result.status).toBe('already_started');
      expect(mockPrisma.routeSegment.update).not.toHaveBeenCalled();
    });

    it('should throw if no planned segments', async () => {
      const plan = makePlan([
        {
          id: 1,
          segmentId: 'seg-1',
          sequenceOrder: 1,
          status: 'COMPLETED',
          segmentType: 'drive',
        },
      ]);

      await expect(service.handleStartRoute(plan, {}, 1)).rejects.toThrow('No planned segments to start');
    });
  });

  describe('handlePickupComplete', () => {
    it('should complete dock segment and update load to in_transit', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 1,
            segmentId: 'seg-1',
            sequenceOrder: 1,
            status: 'COMPLETED',
            segmentType: 'drive',
          },
          {
            id: 2,
            segmentId: 'seg-2',
            sequenceOrder: 2,
            status: 'IN_PROGRESS',
            segmentType: 'dock',
            actionType: 'pickup',
            stopId: 10,
          },
          {
            id: 3,
            segmentId: 'seg-3',
            sequenceOrder: 3,
            status: 'PLANNED',
            segmentType: 'drive',
          },
        ],
      };

      mockPrisma.routePlanLoad.findMany.mockResolvedValue([
        { load: { id: 100, loadId: 'LOAD-001', stops: [{ stopId: 10 }] } },
      ]);
      // For checkAndCompletePlan: not all segments done
      mockPrisma.routeSegment.findMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'IN_PROGRESS' },
      ]);

      const result = await service.handlePickupComplete(plan, { segmentId: 'seg-2' }, 1);

      expect(result.status).toBe('pickup_confirmed');
      // Dock segment completed
      expect(mockPrisma.routeSegment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      // Next drive segment started
      expect(mockPrisma.routeSegment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3 },
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
      // Load updated to in_transit
      expect(mockPrisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 100 },
          data: { status: 'IN_TRANSIT' },
        }),
      );
      // Event recorded
      expect(mockRouteEventService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'PICKUP_CONFIRMED',
          source: 'driver',
        }),
      );
    });

    it('should throw if segment is not a pickup dock', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 1,
            segmentId: 'seg-1',
            sequenceOrder: 1,
            status: 'IN_PROGRESS',
            segmentType: 'drive',
          },
        ],
      };

      await expect(service.handlePickupComplete(plan, { segmentId: 'seg-1' }, 1)).rejects.toThrow(
        'Pickup can only be confirmed on dock segments',
      );
    });

    it('should be idempotent if already completed', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 2,
            segmentId: 'seg-2',
            sequenceOrder: 2,
            status: 'COMPLETED',
            segmentType: 'dock',
            actionType: 'pickup',
          },
        ],
      };

      const result = await service.handlePickupComplete(plan, { segmentId: 'seg-2' }, 1);
      expect(result.status).toBe('already_completed');
    });
  });

  describe('handleDeliveryComplete', () => {
    it('should complete dock segment, update load to delivered, and trigger plan completion', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 1,
            segmentId: 'seg-1',
            sequenceOrder: 1,
            status: 'COMPLETED',
            segmentType: 'drive',
          },
          {
            id: 2,
            segmentId: 'seg-2',
            sequenceOrder: 2,
            status: 'IN_PROGRESS',
            segmentType: 'dock',
            actionType: 'dropoff',
            stopId: 20,
          },
        ],
      };

      mockPrisma.routePlanLoad.findMany.mockResolvedValue([
        { load: { id: 200, loadId: 'LOAD-002', stops: [{ stopId: 20 }] } },
      ]);
      // All segments completed after this one
      mockPrisma.routeSegment.findMany.mockResolvedValue([{ status: 'COMPLETED' }, { status: 'COMPLETED' }]);

      const result = await service.handleDeliveryComplete(plan, { segmentId: 'seg-2' }, 1);

      expect(result.status).toBe('delivery_confirmed');
      // Load updated to delivered
      expect(mockPrisma.load.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'DELIVERED' } }));
      // Plan should be marked completed (all segments done)
      expect(mockPrisma.routePlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            isActive: false,
          }),
        }),
      );
    });
  });

  describe('handleDispatcherOverride', () => {
    it('should change segment status and record reason', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 2,
            segmentId: 'seg-2',
            sequenceOrder: 2,
            status: 'IN_PROGRESS',
            segmentType: 'dock',
            actionType: 'pickup',
          },
        ],
      };
      mockPrisma.routeSegment.findMany.mockResolvedValue([{ status: 'COMPLETED' }]);

      const result = await service.handleDispatcherOverride(
        plan,
        {
          segmentId: 'seg-2',
          newStatus: 'COMPLETED',
          reason: 'Confirmed by phone',
        },
        1,
        'user-dispatch-1',
      );

      expect(result.status).toBe('overridden');
      expect(result.previousStatus).toBe('IN_PROGRESS');
      expect(result.newStatus).toBe('COMPLETED');
      expect(mockRouteEventService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'DISPATCHER_OVERRIDE',
          source: 'dispatcher',
          eventData: expect.objectContaining({
            reason: 'Confirmed by phone',
            dispatcherUserId: 'user-dispatch-1',
          }),
        }),
      );
    });

    it('should confirm pickup on driver behalf with confirmPickup flag', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 2,
            segmentId: 'seg-2',
            sequenceOrder: 2,
            status: 'IN_PROGRESS',
            segmentType: 'dock',
            actionType: 'pickup',
            stopId: 10,
          },
        ],
      };
      mockPrisma.routePlanLoad.findMany.mockResolvedValue([
        { load: { id: 100, loadId: 'LOAD-001', stops: [{ stopId: 10 }] } },
      ]);
      mockPrisma.routeSegment.findMany.mockResolvedValue([{ status: 'COMPLETED' }]);

      await service.handleDispatcherOverride(
        plan,
        {
          segmentId: 'seg-2',
          newStatus: 'completed',
          reason: 'Driver forgot',
          confirmPickup: true,
        },
        1,
        'user-dispatch-1',
      );

      expect(mockPrisma.load.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'IN_TRANSIT' } }));
    });
  });

  describe('plan auto-completion (via handleDeliveryComplete)', () => {
    it('should NOT complete plan if segments remain', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 1,
            segmentId: 'seg-1',
            sequenceOrder: 1,
            status: 'COMPLETED',
            segmentType: 'drive',
          },
          {
            id: 2,
            segmentId: 'seg-2',
            sequenceOrder: 2,
            status: 'IN_PROGRESS',
            segmentType: 'dock',
            actionType: 'dropoff',
            stopId: 20,
          },
          {
            id: 3,
            segmentId: 'seg-3',
            sequenceOrder: 3,
            status: 'PLANNED',
            segmentType: 'drive',
          },
        ],
      };

      mockPrisma.routePlanLoad.findMany.mockResolvedValue([]);
      // Not all done — seg-3 still in_progress after being started
      mockPrisma.routeSegment.findMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'IN_PROGRESS' },
      ]);

      await service.handleDeliveryComplete(plan, { segmentId: 'seg-2' }, 1);

      // Plan should NOT be marked completed
      expect(mockPrisma.routePlan.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('should complete plan with skipped segments', async () => {
      const plan = {
        id: 1,
        planId: 'RP-001',
        segments: [
          {
            id: 1,
            segmentId: 'seg-1',
            sequenceOrder: 1,
            status: 'COMPLETED',
            segmentType: 'drive',
          },
          {
            id: 2,
            segmentId: 'seg-2',
            sequenceOrder: 2,
            status: 'IN_PROGRESS',
            segmentType: 'dock',
            actionType: 'dropoff',
            stopId: 20,
          },
        ],
      };

      mockPrisma.routePlanLoad.findMany.mockResolvedValue([]);
      // All done (mix of completed + skipped)
      mockPrisma.routeSegment.findMany.mockResolvedValue([{ status: 'COMPLETED' }, { status: 'SKIPPED' }]);

      await service.handleDeliveryComplete(plan, { segmentId: 'seg-2' }, 1);

      // Plan should be marked completed
      expect(mockPrisma.routePlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            isActive: false,
          }),
        }),
      );
      expect(mockRouteEventService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ROUTE_COMPLETED',
          source: 'system',
        }),
      );
    });
  });
});

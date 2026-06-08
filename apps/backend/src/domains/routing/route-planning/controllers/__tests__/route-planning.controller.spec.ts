import { Test, TestingModule } from '@nestjs/testing';
import { RoutePlanningController } from '../route-planning.controller';
import { RoutePlanningEngineService } from '../../services/route-planning-engine.service';
import { RoutePlanPersistenceService } from '../../services/route-plan-persistence.service';
import { RoutePlanFeedbackService } from '../../services/route-plan-feedback.service';
import { GeoJSONService } from '../../services/geojson.service';
import { GeocodingService } from '../../../../platform-services/geocoding/geocoding.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('RoutePlanningController', () => {
  let controller: RoutePlanningController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
    driverId: undefined,
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    load: { findMany: jest.fn() },
    stop: { update: jest.fn() },
    driver: { findFirst: jest.fn() },
    routePlan: { findUnique: jest.fn() },
    routeEvent: { create: jest.fn() },
  };

  const mockRoutePlanningEngine = {
    planRoute: jest.fn(),
  };

  const mockPersistenceService = {
    listPlans: jest.fn(),
    getPlanById: jest.fn(),
    activatePlan: jest.fn(),
    cancelPlan: jest.fn(),
    getActivePlanForDriver: jest.fn(),
    updateSegmentStatus: jest.fn(),
    supersedePlan: jest.fn(),
  };

  const mockFeedbackService = {
    submitFeedback: jest.fn(),
  };

  const mockGeojsonService = {
    planToGeoJSON: jest.fn(),
  };

  const mockGeocodingService = {
    geocodeStop: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoutePlanningController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: RoutePlanningEngineService,
          useValue: mockRoutePlanningEngine,
        },
        {
          provide: RoutePlanPersistenceService,
          useValue: mockPersistenceService,
        },
        { provide: RoutePlanFeedbackService, useValue: mockFeedbackService },
        { provide: GeoJSONService, useValue: mockGeojsonService },
        { provide: GeocodingService, useValue: mockGeocodingService },
      ],
    }).compile();

    controller = module.get<RoutePlanningController>(RoutePlanningController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /plan (planRoute)', () => {
    it('should plan a route with valid input', async () => {
      const body = {
        driverId: 'DRV-1',
        vehicleId: 'VEH-1',
        loadIds: ['LD-1'],
        departureTime: '2026-04-01T08:00:00Z',
        optimizationPriority: 'minimize_time',
      };
      const planResult = { planId: 'PLN-1' };
      mockRoutePlanningEngine.planRoute.mockResolvedValue(planResult);

      const result = await controller.planRoute(body, mockUser);

      expect(mockRoutePlanningEngine.planRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: 'DRV-1',
          vehicleId: 'VEH-1',
          loadIds: ['LD-1'],
          tenantId: 1,
        }),
      );
      expect(result).toEqual(planResult);
    });

    it('should throw BadRequestException for invalid Zod input', async () => {
      const body = { driverId: 'DRV-1' }; // missing required fields

      await expect(controller.planRoute(body, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET / (listRoutes)', () => {
    it('should list routes with filters', async () => {
      mockPersistenceService.listPlans.mockResolvedValue({
        items: [],
        total: 0,
      });

      await controller.listRoutes('active', '10', '0', undefined, undefined, mockUser);

      expect(mockPersistenceService.listPlans).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          status: 'active',
          limit: 10,
        }),
      );
    });
  });

  describe('GET /:planId (getPlan)', () => {
    it('should return plan details', async () => {
      const plan = {
        planId: 'PLN-1',
        tenantId: 1,
        driver: { driverId: 'DRV-1' },
      };
      mockPersistenceService.getPlanById.mockResolvedValue(plan);

      const result = await controller.getPlan('PLN-1', mockUser);
      expect(result).toEqual(plan);
    });
  });

  describe('POST /:planId/activate (activateRoute)', () => {
    it('should activate a plan', async () => {
      const plan = {
        planId: 'PLN-1',
        tenantId: 1,
        loads: [],
      };
      mockPersistenceService.getPlanById.mockResolvedValue(plan);
      mockPersistenceService.activatePlan.mockResolvedValue({
        ...plan,
        status: 'ACTIVE',
      });

      await controller.activateRoute('PLN-1', {}, mockUser);
      expect(mockPersistenceService.activatePlan).toHaveBeenCalledWith('PLN-1');
    });

    it('should throw ConflictException for reassignment without confirmation', async () => {
      const plan = {
        planId: 'PLN-1',
        tenantId: 1,
        driverId: 10,
        loads: [
          {
            load: {
              loadNumber: 'LD-1',
              driverId: 20,
              status: 'ASSIGNED',
            },
          },
        ],
      };
      mockPersistenceService.getPlanById.mockResolvedValue(plan);

      await expect(controller.activateRoute('PLN-1', {}, mockUser)).rejects.toThrow(ConflictException);
    });
  });

  describe('POST /:planId/cancel (cancelRoute)', () => {
    it('should cancel a plan', async () => {
      const plan = { planId: 'PLN-1', tenantId: 1 };
      mockPersistenceService.getPlanById.mockResolvedValue(plan);
      mockPersistenceService.cancelPlan.mockResolvedValue({
        ...plan,
        status: 'CANCELLED',
      });

      await controller.cancelRoute('PLN-1', mockUser);
      expect(mockPersistenceService.cancelPlan).toHaveBeenCalledWith('PLN-1');
    });
  });

  describe('DELETE /:planId/draft (discardDraft)', () => {
    it('should discard draft plan', async () => {
      mockPersistenceService.getPlanById.mockResolvedValue({
        planId: 'PLN-1',
        tenantId: 1,
        status: 'DRAFT',
      });
      mockPersistenceService.cancelPlan.mockResolvedValue({});

      await controller.discardDraft('PLN-1', mockUser);
      expect(mockPersistenceService.cancelPlan).toHaveBeenCalledWith('PLN-1');
    });

    it('should reject non-draft plans', async () => {
      mockPersistenceService.getPlanById.mockResolvedValue({
        planId: 'PLN-1',
        tenantId: 1,
        status: 'ACTIVE',
      });

      await expect(controller.discardDraft('PLN-1', mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /:planId/segments/:segmentId/status', () => {
    it('should update segment status', async () => {
      mockPersistenceService.updateSegmentStatus.mockResolvedValue({
        status: 'COMPLETED',
      });

      await controller.updateSegmentStatus(
        'PLN-1',
        'SEG-1',
        {
          status: 'COMPLETED',
        },
        mockUser,
      );

      expect(mockPersistenceService.updateSegmentStatus).toHaveBeenCalledWith(
        'PLN-1',
        'SEG-1',
        { status: 'COMPLETED' },
        1,
      );
    });

    it('should reject invalid status', async () => {
      await expect(
        controller.updateSegmentStatus(
          'PLN-1',
          'SEG-1',
          {
            status: 'invalid',
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /:planId/segments/:segmentId/feedback', () => {
    it('should submit feedback', async () => {
      mockFeedbackService.submitFeedback.mockResolvedValue({ id: 1 });

      await controller.submitSegmentFeedback(
        'PLN-1',
        'SEG-1',
        {
          rating: 'good',
          reason: 'Efficient route',
        } as any,
        mockUser,
      );

      expect(mockFeedbackService.submitFeedback).toHaveBeenCalledWith({
        planId: 'PLN-1',
        segmentId: 'SEG-1',
        rating: 'good',
        reason: 'Efficient route',
        userId: 1,
        tenantId: 1,
      });
    });
  });

  describe('GET /driver/:driverId/active', () => {
    it('should get active route for driver', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({
        id: 5,
        driverId: 'DRV-1',
      });
      mockPersistenceService.getActivePlanForDriver.mockResolvedValue({
        planId: 'PLN-1',
      });

      const result = await controller.getDriverActiveRoute('DRV-1', mockUser);
      expect(mockPersistenceService.getActivePlanForDriver).toHaveBeenCalledWith(5);
      expect(result).toEqual({ planId: 'PLN-1' });
    });

    it('should throw NotFoundException if driver not found', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(null);

      await expect(controller.getDriverActiveRoute('DRV-NOT', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /geocode-stops', () => {
    it('should geocode missing stops', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          stops: [
            {
              stop: {
                id: 1,
                lat: null,
                lon: null,
                address: '123 Main',
                city: 'Dallas',
                state: 'TX',
                zipCode: '75001',
                name: 'Warehouse',
              },
            },
          ],
        },
      ]);
      mockGeocodingService.geocodeStop.mockResolvedValue({
        latitude: 32.78,
        longitude: -96.8,
        confidence: 0.9,
      });

      const result = await controller.geocodeStops({ loadIds: ['LD-1'] } as any, mockUser);

      expect(result.geocoded).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockPrisma.stop.update).toHaveBeenCalled();
    });
  });

  describe('GET /:planId/geojson', () => {
    it('should return GeoJSON', async () => {
      const plan = {
        planId: 'PLN-1',
        tenantId: 1,
        driver: { driverId: 'DRV-1' },
      };
      mockPersistenceService.getPlanById.mockResolvedValue(plan);
      mockGeojsonService.planToGeoJSON.mockReturnValue({
        type: 'FeatureCollection',
      });

      const result = await controller.getGeoJSON('PLN-1', mockUser);
      expect(result.type).toBe('FeatureCollection');
    });
  });

  // ─── POST /:planId/replan ───────────────────────────────────────────────

  describe('POST /:planId/replan (replanRoute)', () => {
    it('should replan an active route', async () => {
      const existingPlan = {
        id: 5,
        planId: 'PLN-1',
        tenantId: 1,
        status: 'ACTIVE',
        optimizationPriority: 'minimize_time',
        segments: [
          { segmentType: 'dock', status: 'COMPLETED', stopId: 'stop-1' },
          { segmentType: 'drive', status: 'PLANNED' },
        ],
        loads: [{ load: { loadNumber: 'LD-1' } }],
        driver: { driverId: 'DRV-1' },
        vehicle: { vehicleId: 'VEH-1' },
        dispatcherParams: null,
      };
      mockPersistenceService.getPlanById.mockResolvedValue(existingPlan);
      mockRoutePlanningEngine.planRoute.mockResolvedValue({
        planId: 'PLN-2',
      });
      mockPrisma.routePlan.findUnique.mockResolvedValue({ id: 6 });
      mockPersistenceService.supersedePlan.mockResolvedValue({});
      mockPrisma.routeEvent.create.mockResolvedValue({});

      const result = await controller.replanRoute('PLN-1', { reason: 'Traffic delay' }, mockUser);

      expect(result).toEqual({ planId: 'PLN-2' });
      expect(mockPersistenceService.supersedePlan).toHaveBeenCalledWith('PLN-1', 6);
      expect(mockPrisma.routeEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'REPLAN_REQUESTED',
          source: 'dispatcher',
          eventData: expect.objectContaining({
            reason: 'Traffic delay',
            newPlanId: 'PLN-2',
          }),
        }),
      });
    });

    it('should reject replan for non-active/non-draft plans', async () => {
      mockPersistenceService.getPlanById.mockResolvedValue({
        planId: 'PLN-1',
        tenantId: 1,
        status: 'CANCELLED',
        segments: [],
        loads: [],
      });

      await expect(controller.replanRoute('PLN-1', {}, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should allow replan for draft plans', async () => {
      const draftPlan = {
        id: 5,
        planId: 'PLN-1',
        tenantId: 1,
        status: 'DRAFT',
        segments: [],
        loads: [{ load: { loadNumber: 'LD-1' } }],
        driver: { driverId: 'DRV-1' },
        vehicle: { vehicleId: 'VEH-1' },
        dispatcherParams: null,
      };
      mockPersistenceService.getPlanById.mockResolvedValue(draftPlan);
      mockRoutePlanningEngine.planRoute.mockResolvedValue({
        planId: 'PLN-2',
      });
      mockPrisma.routePlan.findUnique.mockResolvedValue({ id: 6 });
      mockPersistenceService.supersedePlan.mockResolvedValue({});
      mockPrisma.routeEvent.create.mockResolvedValue({});

      const result = await controller.replanRoute('PLN-1', {}, mockUser);
      expect(result).toEqual({ planId: 'PLN-2' });
    });

    it('should exclude completed dock stops from replan', async () => {
      const existingPlan = {
        id: 5,
        planId: 'PLN-1',
        tenantId: 1,
        status: 'ACTIVE',
        segments: [
          {
            segmentType: 'dock',
            status: 'COMPLETED',
            stopId: 'stop-completed-1',
          },
          {
            segmentType: 'dock',
            status: 'SKIPPED',
            stopId: 'stop-skipped-1',
          },
          { segmentType: 'drive', status: 'PLANNED', stopId: null },
        ],
        loads: [{ load: { loadNumber: 'LD-1' } }],
        driver: { driverId: 'DRV-1' },
        vehicle: { vehicleId: 'VEH-1' },
        dispatcherParams: null,
      };
      mockPersistenceService.getPlanById.mockResolvedValue(existingPlan);
      mockRoutePlanningEngine.planRoute.mockResolvedValue({ planId: 'PLN-2' });
      mockPrisma.routePlan.findUnique.mockResolvedValue({ id: 6 });
      mockPersistenceService.supersedePlan.mockResolvedValue({});
      mockPrisma.routeEvent.create.mockResolvedValue({});

      await controller.replanRoute('PLN-1', {}, mockUser);

      expect(mockRoutePlanningEngine.planRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCompletedStops: ['stop-completed-1', 'stop-skipped-1'],
          startFromCurrentLocation: true,
          _skipRelayDetection: true,
        }),
      );
    });
  });

  // ─── POST /geocode-stops edge cases ─────────────────────────────────────

  describe('POST /geocode-stops (edge cases)', () => {
    it('should return zero counts when all stops have coordinates', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          stops: [
            {
              stop: { id: 1, lat: 32.78, lon: -96.8, name: 'Has coords' },
            },
          ],
        },
      ]);

      const result = await controller.geocodeStops({ loadIds: ['LD-1'] } as any, mockUser);

      expect(result.geocoded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should throw when too many stops to geocode', async () => {
      const manyStops = Array.from({ length: 51 }, (_, i) => ({
        stop: {
          id: i + 1,
          lat: null,
          lon: null,
          name: `Stop ${i}`,
          address: '123 Main',
          city: 'Dallas',
          state: 'TX',
          zipCode: '75001',
        },
      }));

      mockPrisma.load.findMany.mockResolvedValue([{ stops: manyStops }]);

      await expect(controller.geocodeStops({ loadIds: ['LD-1'] } as any, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should count failed geocoding when confidence is below 0.5', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          stops: [
            {
              stop: {
                id: 1,
                lat: null,
                lon: null,
                address: '123 Main',
                city: 'Dallas',
                state: 'TX',
                zipCode: '75001',
                name: 'Low confidence',
              },
            },
          ],
        },
      ]);
      mockGeocodingService.geocodeStop.mockResolvedValue({
        latitude: 32.78,
        longitude: -96.8,
        confidence: 0.3,
      });

      const result = await controller.geocodeStops({ loadIds: ['LD-1'] } as any, mockUser);

      expect(result.geocoded).toBe(0);
      expect(result.failed).toBe(1);
      expect(mockPrisma.stop.update).not.toHaveBeenCalled();
    });

    it('should count failed geocoding when result is null', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          stops: [
            {
              stop: {
                id: 1,
                lat: null,
                lon: null,
                address: null,
                city: null,
                state: null,
                zipCode: null,
                name: 'Unknown',
              },
            },
          ],
        },
      ]);
      mockGeocodingService.geocodeStop.mockResolvedValue(null);

      const result = await controller.geocodeStops({ loadIds: ['LD-1'] } as any, mockUser);

      expect(result.geocoded).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  // ─── POST /:planId/activate with reassignment confirmation ──────────

  describe('POST /:planId/activate (reassignment confirmation)', () => {
    it('should allow activation when confirmReassignment is true', async () => {
      const plan = {
        planId: 'PLN-1',
        tenantId: 1,
        driverId: 10,
        loads: [
          {
            load: {
              loadNumber: 'LD-1',
              driverId: 20,
              status: 'ASSIGNED',
            },
          },
        ],
      };
      mockPersistenceService.getPlanById.mockResolvedValue(plan);
      mockPersistenceService.activatePlan.mockResolvedValue({
        ...plan,
        status: 'ACTIVE',
      });

      await controller.activateRoute('PLN-1', { confirmReassignment: true }, mockUser);

      expect(mockPersistenceService.activatePlan).toHaveBeenCalledWith('PLN-1');
    });

    it('should not conflict for pending loads assigned to different driver', async () => {
      const plan = {
        planId: 'PLN-1',
        tenantId: 1,
        driverId: 10,
        loads: [
          {
            load: {
              loadNumber: 'LD-1',
              driverId: 20,
              status: 'PENDING', // pending, not assigned — no conflict
            },
          },
        ],
      };
      mockPersistenceService.getPlanById.mockResolvedValue(plan);
      mockPersistenceService.activatePlan.mockResolvedValue({
        ...plan,
        status: 'ACTIVE',
      });

      await expect(controller.activateRoute('PLN-1', {}, mockUser)).resolves.toBeDefined();
    });
  });
});

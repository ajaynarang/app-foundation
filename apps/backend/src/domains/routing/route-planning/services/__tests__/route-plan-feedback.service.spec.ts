import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RoutePlanFeedbackService } from '../route-plan-feedback.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks';

describe('RoutePlanFeedbackService', () => {
  let service: RoutePlanFeedbackService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RoutePlanFeedbackService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<RoutePlanFeedbackService>(RoutePlanFeedbackService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── submitFeedback ──────────────────────────────────────────────────────

  describe('submitFeedback', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(null);

      await expect(
        service.submitFeedback({
          planId: 'RP-UNKNOWN',
          segmentId: 'seg-1',
          rating: 'good',
          userId: 1,
          tenantId: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when segment not found', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({ id: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue(null);

      await expect(
        service.submitFeedback({
          planId: 'RP-1',
          segmentId: 'seg-missing',
          rating: 'bad',
          userId: 1,
          tenantId: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create new feedback when none exists', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({ id: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({ id: 10 });
      prisma.routePlanFeedback.findFirst.mockResolvedValue(null);
      prisma.routePlanFeedback.create.mockResolvedValue({
        id: 100,
        planId: 'RP-1',
        segmentId: 'seg-1',
        rating: 'good',
        reason: null,
        createdAt: new Date(),
      });

      const result = await service.submitFeedback({
        planId: 'RP-1',
        segmentId: 'seg-1',
        rating: 'good',
        userId: 1,
        tenantId: 1,
      });

      expect(result.id).toBe(100);
      expect(result.rating).toBe('good');
      expect(prisma.routePlanFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          planId: 'RP-1',
          segmentId: 'seg-1',
          rating: 'good',
          userId: 1,
          tenantId: 1,
        }),
      });
    });

    it('should update existing feedback (upsert behavior)', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({ id: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({ id: 10 });
      prisma.routePlanFeedback.findFirst.mockResolvedValue({
        id: 50,
        rating: 'good',
      });
      prisma.routePlanFeedback.update.mockResolvedValue({
        id: 50,
        planId: 'RP-1',
        segmentId: 'seg-1',
        rating: 'bad',
        reason: 'Too long rest',
        createdAt: new Date(),
      });

      const result = await service.submitFeedback({
        planId: 'RP-1',
        segmentId: 'seg-1',
        rating: 'bad',
        reason: 'Too long rest',
        userId: 1,
        tenantId: 1,
      });

      expect(result.rating).toBe('bad');
      expect(result.reason).toBe('Too long rest');
      expect(prisma.routePlanFeedback.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: { rating: 'bad', reason: 'Too long rest' },
      });
    });

    it('should skip segment validation for plan-level feedback', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({ id: 1 });
      prisma.routePlanFeedback.findFirst.mockResolvedValue(null);
      prisma.routePlanFeedback.create.mockResolvedValue({
        id: 200,
        planId: 'RP-1',
        segmentId: 'plan-overall-RP-1',
        rating: 'good',
        reason: null,
        createdAt: new Date(),
      });

      const result = await service.submitFeedback({
        planId: 'RP-1',
        segmentId: 'plan-overall-RP-1',
        rating: 'good',
        userId: 1,
        tenantId: 1,
      });

      expect(result.id).toBe(200);
      // Should NOT have checked routeSegment
      expect(prisma.routeSegment.findFirst).not.toHaveBeenCalled();
    });

    it('should store reason as null when not provided', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({ id: 1 });
      prisma.routeSegment.findFirst.mockResolvedValue({ id: 10 });
      prisma.routePlanFeedback.findFirst.mockResolvedValue(null);
      prisma.routePlanFeedback.create.mockResolvedValue({
        id: 300,
        planId: 'RP-1',
        segmentId: 'seg-1',
        rating: 'bad',
        reason: null,
        createdAt: new Date(),
      });

      await service.submitFeedback({
        planId: 'RP-1',
        segmentId: 'seg-1',
        rating: 'bad',
        userId: 1,
        tenantId: 1,
      });

      expect(prisma.routePlanFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reason: null }),
      });
    });
  });
});

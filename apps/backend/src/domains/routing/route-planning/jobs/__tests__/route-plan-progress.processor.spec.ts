import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { RoutePlanProgressJobHandler } from '../route-plan-progress.processor';
import { RoutePlanProgressService } from '../../services/route-plan-progress.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { GEO_COMPUTE_JOB_NAMES } from '../../../../../infrastructure/queue/queue.constants';

function makeEnvelope<P>(payload: P): JobEnvelope<P> {
  return {
    tenantId: 'system',
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'cron', version: 1 },
  };
}

function makeJob<P>(
  name: string,
  payload: P,
  opts?: { attemptsMade?: number; attempts?: number },
): Job<JobEnvelope<P>> {
  return {
    id: 'j1',
    name,
    data: makeEnvelope(payload),
    attemptsMade: opts?.attemptsMade ?? 0,
    opts: { attempts: opts?.attempts ?? 1 },
  } as unknown as Job<JobEnvelope<P>>;
}

describe('RoutePlanProgressJobHandler', () => {
  let processor: RoutePlanProgressJobHandler;

  const mockProgressService = {
    updateProgress: jest.fn(),
  };

  const mockPrisma = {
    routePlan: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutePlanProgressJobHandler,
        { provide: RoutePlanProgressService, useValue: mockProgressService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<RoutePlanProgressJobHandler>(RoutePlanProgressJobHandler);
  });

  afterEach(() => jest.clearAllMocks());

  describe('run - route-progress (all active plans)', () => {
    it('should update progress for all active plans', async () => {
      mockPrisma.routePlan.findMany.mockResolvedValue([
        { id: 1, planId: 'PLN-1' },
        { id: 2, planId: 'PLN-2' },
      ]);

      await processor.run(makeJob(GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS, {}));

      expect(mockPrisma.routePlan.findMany).toHaveBeenCalledWith({
        where: { isActive: true, status: 'ACTIVE' },
        select: { id: true, planId: true },
      });
      expect(mockProgressService.updateProgress).toHaveBeenCalledTimes(2);
      expect(mockProgressService.updateProgress).toHaveBeenCalledWith(1);
      expect(mockProgressService.updateProgress).toHaveBeenCalledWith(2);
    });

    it('should skip when no active plans', async () => {
      mockPrisma.routePlan.findMany.mockResolvedValue([]);

      await processor.run(makeJob(GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS, {}));

      expect(mockProgressService.updateProgress).not.toHaveBeenCalled();
    });

    it('should continue processing remaining plans on individual failure', async () => {
      mockPrisma.routePlan.findMany.mockResolvedValue([
        { id: 1, planId: 'PLN-1' },
        { id: 2, planId: 'PLN-2' },
        { id: 3, planId: 'PLN-3' },
      ]);
      mockProgressService.updateProgress
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('GPS data unavailable'))
        .mockResolvedValueOnce(undefined);

      // Should not throw - errors are caught per-plan
      await processor.run(makeJob(GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS, {}));

      expect(mockProgressService.updateProgress).toHaveBeenCalledTimes(3);
    });
  });

  describe('run - update-progress (single plan)', () => {
    it('should update progress for a single plan', async () => {
      await processor.run(makeJob('update-progress', { planId: 42 }));

      expect(mockProgressService.updateProgress).toHaveBeenCalledWith(42);
    });

    it('should throw on single plan update failure', async () => {
      mockProgressService.updateProgress.mockRejectedValue(new Error('Plan not found'));

      await expect(processor.run(makeJob('update-progress', { planId: 99 }))).rejects.toThrow('Plan not found');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { LoadMileageJobHandler } from '../load-mileage.processor';
import { LoadMileageService } from '../load-mileage.service';
import { GEO_COMPUTE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';

type RecalcEnv = JobEnvelope<{ loadId: number }>;

function makeEnvelope(loadId: number): RecalcEnv {
  return {
    tenantId: '3',
    correlationId: 'corr-1',
    payload: { loadId },
    metadata: { enqueuedAt: new Date().toISOString(), source: 'api', version: 1 },
  };
}

function makeJob(
  name: string,
  envelope: RecalcEnv,
  opts?: { attemptsMade?: number; attempts?: number },
): Job<RecalcEnv> {
  return {
    id: 'j1',
    name,
    data: envelope,
    attemptsMade: opts?.attemptsMade ?? 0,
    opts: { attempts: opts?.attempts ?? 3 },
  } as unknown as Job<RecalcEnv>;
}

describe('LoadMileageJobHandler', () => {
  let processor: LoadMileageJobHandler;
  let service: { recompute: jest.Mock };

  beforeEach(async () => {
    service = { recompute: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoadMileageJobHandler, { provide: LoadMileageService, useValue: service }],
    }).compile();
    processor = module.get(LoadMileageJobHandler);
  });

  describe('run', () => {
    it('delegates the job loadId to LoadMileageService.recompute', async () => {
      await processor.run(makeJob(GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC, makeEnvelope(42)));
      expect(service.recompute).toHaveBeenCalledWith(42);
    });

    it('does not swallow recompute errors (lets BullMQ retry)', async () => {
      service.recompute.mockRejectedValue(new Error('boom'));
      await expect(processor.run(makeJob(GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC, makeEnvelope(1)))).rejects.toThrow(
        'boom',
      );
    });

    it('skips when payload is missing loadId', async () => {
      const env = { ...makeEnvelope(0), payload: {} as { loadId: number } };
      await processor.run(makeJob(GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC, env));
      expect(service.recompute).not.toHaveBeenCalled();
    });
  });
});

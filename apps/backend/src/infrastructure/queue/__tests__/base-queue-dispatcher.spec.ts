import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BaseQueueDispatcher } from '../base-queue-dispatcher';
import { QueueJobHandler } from '../job-handler.contract';
import { DeadLetterService } from '../dead-letter.service';

// Minimal concrete subclass for testing the shared dispatch + failed behavior.
@Processor('test-queue')
class TestDispatcher extends BaseQueueDispatcher {
  protected readonly logger = new Logger('TestDispatcher');
  constructor(handlers: QueueJobHandler[], deadLetter: DeadLetterService) {
    super(handlers, deadLetter);
  }
}

describe('BaseQueueDispatcher', () => {
  const mockDeadLetter = {
    recordPermanentFailure: jest.fn().mockResolvedValue(undefined),
  } as unknown as DeadLetterService;

  const makeJob = (overrides: Partial<Job> = {}): Job =>
    ({ id: '1', name: 'alpha', opts: { attempts: 3 }, attemptsMade: 0, ...overrides }) as Job;

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('routes a job to the handler that owns its name', async () => {
      const alpha = { jobNames: ['alpha'], run: jest.fn().mockResolvedValue('alpha-result') };
      const beta = { jobNames: ['beta'], run: jest.fn().mockResolvedValue('beta-result') };
      const dispatcher = new TestDispatcher([alpha, beta], mockDeadLetter);

      const result = await dispatcher.process(makeJob({ name: 'beta' }));

      expect(beta.run).toHaveBeenCalledTimes(1);
      expect(alpha.run).not.toHaveBeenCalled();
      expect(result).toBe('beta-result');
    });

    it('no-ops (no throw) when no handler owns the job name', async () => {
      const alpha = { jobNames: ['alpha'], run: jest.fn() };
      const dispatcher = new TestDispatcher([alpha], mockDeadLetter);

      const result = await dispatcher.process(makeJob({ name: 'orphan' }));

      expect(result).toBeUndefined();
      expect(alpha.run).not.toHaveBeenCalled();
    });

    it('propagates a handler error for BullMQ retry', async () => {
      const boom = new Error('handler exploded');
      const alpha = { jobNames: ['alpha'], run: jest.fn().mockRejectedValue(boom) };
      const dispatcher = new TestDispatcher([alpha], mockDeadLetter);

      await expect(dispatcher.process(makeJob({ name: 'alpha' }))).rejects.toThrow('handler exploded');
    });
  });

  describe('onFailed', () => {
    it('dead-letters only when retries are exhausted', async () => {
      const dispatcher = new TestDispatcher([], mockDeadLetter);
      const err = new Error('final');

      await dispatcher.onFailed(makeJob({ attemptsMade: 3, opts: { attempts: 3 } }), err);
      expect(mockDeadLetter.recordPermanentFailure).toHaveBeenCalledWith(expect.any(Object), err);
    });

    it('does NOT dead-letter while retries remain', async () => {
      const dispatcher = new TestDispatcher([], mockDeadLetter);

      await dispatcher.onFailed(makeJob({ attemptsMade: 1, opts: { attempts: 3 } }), new Error('transient'));
      expect(mockDeadLetter.recordPermanentFailure).not.toHaveBeenCalled();
    });
  });
});

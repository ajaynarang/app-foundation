import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BaseQueueDispatcher } from '../base-queue-dispatcher';
import { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DeadLetterService } from '../dead-letter.service';
import { requestContextStorage } from '@appshore/kernel/infrastructure/logging/request-context.middleware';
import { JOB_EVENTS } from '@appshore/kernel/infrastructure/queue/job-events';

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

    it('completes (no throw) but logs job.unknown at error when no handler owns the job name', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const alpha = { jobNames: ['alpha'], run: jest.fn() };
      const dispatcher = new TestDispatcher([alpha], mockDeadLetter);

      const result = await dispatcher.process(
        makeJob({ id: '5', name: 'orphan', queueName: 'test-queue', data: { tenantId: '3' } }),
      );

      expect(result).toBeUndefined();
      expect(alpha.run).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: JOB_EVENTS.JOB_UNKNOWN,
          jobName: 'orphan',
          jobId: '5',
          queue: 'test-queue',
          tenantId: '3',
        }),
      );
      errorSpy.mockRestore();
    });

    it("runs the handler inside the job's log context", async () => {
      let seen: unknown;
      const alpha = {
        jobNames: ['alpha'],
        run: jest.fn(async () => {
          seen = requestContextStorage.getStore();
        }),
      };
      const dispatcher = new TestDispatcher([alpha], mockDeadLetter);

      await dispatcher.process(makeJob({ id: '77', name: 'alpha', data: { tenantId: 'demo', tenantDbId: 4 } }));

      expect(seen).toEqual(
        expect.objectContaining({ jobName: 'alpha', jobId: '77', tenantId: 'demo', tenantDbId: '4' }),
      );
    });

    it('propagates a handler error for BullMQ retry', async () => {
      const boom = new Error('handler exploded');
      const alpha = { jobNames: ['alpha'], run: jest.fn().mockRejectedValue(boom) };
      const dispatcher = new TestDispatcher([alpha], mockDeadLetter);

      await expect(dispatcher.process(makeJob({ name: 'alpha' }))).rejects.toThrow('handler exploded');
    });
  });

  describe('onFailed', () => {
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('logs a final job.failed line carrying jobName, jobId, queue and tenantId', async () => {
      const dispatcher = new TestDispatcher([], mockDeadLetter);

      await dispatcher.onFailed(
        makeJob({ id: '42', name: 'alpha', queueName: 'test-queue', data: { tenantId: '8' }, attemptsMade: 3 }),
        new Error('final'),
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: JOB_EVENTS.JOB_FAILED,
          jobName: 'alpha',
          jobId: '42',
          queue: 'test-queue',
          tenantId: '8',
          attempt: 3,
          final: true,
          err: expect.objectContaining({ type: 'Error', message: 'final' }),
        }),
      );
    });

    it('logs a retryable attempt as job.failed final=false at warn', async () => {
      const dispatcher = new TestDispatcher([], mockDeadLetter);

      await dispatcher.onFailed(makeJob({ attemptsMade: 1 }), new Error('transient'));

      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ event: JOB_EVENTS.JOB_FAILED, final: false }));
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('dead-letters an UnrecoverableError failure even with attempts left', async () => {
      const dispatcher = new TestDispatcher([], mockDeadLetter);

      await dispatcher.onFailed(makeJob({ attemptsMade: 1, finishedOn: Date.now() }), new Error('unrecoverable'));

      expect(mockDeadLetter.recordPermanentFailure).toHaveBeenCalledTimes(1);
    });

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

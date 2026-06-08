import { Logger } from '@nestjs/common';
import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QueueJobHandler } from './job-handler.contract';
import { DeadLetterService } from './dead-letter.service';

/**
 * The single `WorkerHost` that owns a queue. Concrete subclasses add the
 * `@Processor(QUEUE_NAMES.X, { concurrency })` decorator and pass the injected
 * handler array up. Being the only `@Processor` on its queue, this worker wins
 * every job and dispatches it to the handler that owns `job.name` — eliminating
 * the competing-consumer race that silently dropped jobs after the 2026-05-27
 * queue topology redesign.
 *
 * Owns the queue's shared `failed` event so dead-letter persistence lives in one
 * place instead of being duplicated (and racing) across per-processor handlers.
 */
export abstract class BaseQueueDispatcher extends WorkerHost {
  protected abstract readonly logger: Logger;

  protected constructor(
    private readonly handlers: QueueJobHandler[],
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const handler = this.handlers.find((h) => h.jobNames.includes(job.name));
    if (!handler) {
      // Unknown name is not an error — it's a job for a sibling queue that was
      // mis-routed, or a stale job from before a rename. Log and no-op so the
      // job completes without a spurious failure/retry storm.
      this.logger.warn(`No handler registered for job "${job.name}" (id=${job.id}); skipping.`);
      return undefined;
    }
    return handler.run(job);
  }

  /**
   * Persist permanent failures to the dead-letter log so they survive Bull's
   * 7-day `failed` set retention. BullMQ emits `failed` after every failed
   * attempt; we only record once retries are exhausted.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 1;
    if ((job.attemptsMade ?? 0) >= maxAttempts) {
      await this.deadLetter.recordPermanentFailure(job, error);
    }
  }
}

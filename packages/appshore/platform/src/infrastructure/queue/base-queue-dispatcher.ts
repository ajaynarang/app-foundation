import { Logger } from '@nestjs/common';
import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { resolveJobTenant, withJobContext } from '@appshore/kernel/infrastructure/logging/job-log-context';
import { JOB_EVENTS, reportJobFailure } from '@appshore/kernel/infrastructure/queue/job-events';
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
      // A mis-routed job or a stale one from before a rename. It still
      // completes (no retry storm), but loudly: work someone scheduled is
      // not being done.
      this.logger.error({
        msg: `No handler registered for job "${job.name}" (id=${job.id}) on ${job.queueName}; skipping.`,
        event: JOB_EVENTS.JOB_UNKNOWN,
        jobName: job.name,
        jobId: job.id != null ? String(job.id) : undefined,
        queue: job.queueName,
        tenantId: resolveJobTenant(job).logTenantId,
      });
      return undefined;
    }
    // Every job runs inside the log context its payload names, so each line
    // it writes carries jobName, jobId and its tenant.
    return withJobContext(job, () => handler.run(job));
  }

  /**
   * Log every failed attempt as one structured `job.failed` line, and persist
   * permanent failures to the dead-letter log so they survive Bull's 7-day
   * `failed` set retention. BullMQ emits `failed` after every failed attempt.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    if (reportJobFailure(this.logger, job, error)) {
      await this.deadLetter.recordPermanentFailure(job, error);
    }
  }
}

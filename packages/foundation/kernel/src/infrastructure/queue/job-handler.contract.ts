import type { Job } from 'bullmq';

/**
 * One handler per BullMQ job *name*. The single `WorkerHost` that owns a queue
 * (see {@link BaseQueueDispatcher}) resolves `job.name → handler.run(job)`.
 *
 * Why this exists: `@nestjs/bullmq` spins up an independent BullMQ `Worker` for
 * every `@Processor(queueName)` class. Two `@Processor` classes on one queue are
 * COMPETING consumers — BullMQ delivers each job to exactly one of them, so a
 * foreign worker could grab a job and (via a `if (job.name !== mine) return`
 * guard) silently complete it without doing the work. Routing every queue
 * through ONE dispatcher that delegates by job name removes that race.
 */
export interface QueueJobHandler {
  /**
   * The BullMQ job name(s) this handler owns (from `*_JOB_NAMES` constants). A
   * handler may own several names when one service covers a family of jobs
   * (e.g. all alert notifications). The dispatcher routes a job to the handler
   * whose `jobNames` includes `job.name`.
   */
  readonly jobNames: readonly string[];

  /**
   * Run the job. Throwing propagates to BullMQ for retry/backoff exactly as a
   * `WorkerHost.process` throw would. The returned value becomes the job's
   * `returnvalue`. Handlers that own multiple names switch on `job.name`.
   */
  run(job: Job): Promise<unknown>;
}

/**
 * Build the DI token a queue's dispatcher injects to receive its handler array.
 *
 * Handlers are assembled explicitly in the queue's dispatcher module via a
 * factory (the dispatcher module imports each owning domain module, which
 * exports its handler class). Cross-module `multi: true` aggregation does NOT
 * merge sibling-module contributions into one array — see
 * `job-handler-aggregation.spec.ts` — so the dispatcher module owns assembly.
 *
 * Keyed by queue name so the token is stable and discoverable per queue.
 */
export function jobHandlersToken(queueName: string): string {
  return `QUEUE_JOB_HANDLERS:${queueName}`;
}

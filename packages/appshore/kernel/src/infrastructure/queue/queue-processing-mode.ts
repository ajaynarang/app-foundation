import { BullModule } from '@nestjs/bullmq';
import { Worker, type Processor, type WorkerOptions } from 'bullmq';

/**
 * Role switch for BullMQ consumption. The API (main.ts) and the worker
 * (worker.ts) boot the same AppModule, so by default both consume jobs. Setting
 * QUEUE_PROCESSORS_ENABLED=false on a process keeps every `@Processor` class
 * wired (event listeners, graceful close) but never pulls a job. Producers
 * (`queue.add()` and repeatable-job registration) use `Queue`, not `Worker`,
 * and are unaffected. Any value other than "false" keeps the shipped behaviour:
 * the process consumes. Held by `__tests__/queue-processing-mode.spec.ts`.
 *
 * Only the API entry point calls `applyQueueProcessingMode()`. The worker never
 * reads the key, so no value of it can stop the worker.
 */
export const QUEUE_PROCESSORS_ENABLED_ENV = 'QUEUE_PROCESSORS_ENABLED';

export function isQueueProcessingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[QUEUE_PROCESSORS_ENABLED_ENV]?.trim().toLowerCase() !== 'false';
}

/** A BullMQ Worker that is constructed but never started (`autorun` forced off). */
export class NonConsumingWorker extends Worker {
  constructor(name: string, processor?: string | URL | null | Processor, opts?: WorkerOptions) {
    super(name, processor, { ...opts, autorun: false } as WorkerOptions);
  }
}

/**
 * Must run before the Nest application is created: @nestjs/bullmq builds a
 * worker per `@Processor` during module init using the configured worker class.
 * Returns whether this process will consume jobs.
 */
export function applyQueueProcessingMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const enabled = isQueueProcessingEnabled(env);
  if (!enabled) {
    BullModule.workerClass = NonConsumingWorker;
  }
  return enabled;
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants';

/**
 * RESERVED — user-blocking AI work (chat, copilot, live agent invocations).
 * Sub-second latency expected. Premium provider quota.
 * Replace this placeholder with a real @Processor when the first interactive AI job lands.
 */
@Processor(QUEUE_NAMES.AI_INTERACTIVE, { concurrency: 3 })
export class AiInteractivePlaceholderProcessor extends WorkerHost {
  private readonly logger = new Logger(AiInteractivePlaceholderProcessor.name);
  async process(job: Job): Promise<void> {
    this.logger.warn(
      `Reserved queue 'ai-interactive' received job '${job.name}' (id=${job.id}); ` +
        `no real handler is registered yet. Did you mean to enqueue elsewhere?`,
    );
  }
}

/**
 * RESERVED — autonomous AI work that's queue-shaped (not workflow-shaped).
 * Most Sally Desk agents run on Inngest, not BullMQ. Use this queue only when a job
 * has at-least-once semantics, retries, and no pause/resume needs.
 * Replace this placeholder when the first BullMQ-shaped agent job lands.
 */
@Processor(QUEUE_NAMES.AI_BACKGROUND, { concurrency: 2 })
export class AiBackgroundPlaceholderProcessor extends WorkerHost {
  private readonly logger = new Logger(AiBackgroundPlaceholderProcessor.name);
  async process(job: Job): Promise<void> {
    this.logger.warn(
      `Reserved queue 'ai-background' received job '${job.name}' (id=${job.id}); ` +
        `no real handler is registered yet. Desk work usually belongs on Inngest.`,
    );
  }
}

/**
 * RESERVED — report generation, KPI rollups, dashboard pre-warming.
 * Heavy DB work; concurrency 1 to protect the read-replica.
 * Replace this placeholder when the first reporting job lands.
 */
@Processor(QUEUE_NAMES.ANALYTICS, { concurrency: 1 })
export class AnalyticsPlaceholderProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsPlaceholderProcessor.name);
  async process(job: Job): Promise<void> {
    this.logger.warn(
      `Reserved queue 'analytics' received job '${job.name}' (id=${job.id}); ` + `no real handler is registered yet.`,
    );
  }
}

/**
 * RESERVED — admin replay endpoint enqueues failed jobs here with full audit trail.
 * Keeps replays isolated from normal traffic so replay storms don't starve real work.
 * Replace this placeholder when the replay endpoint is wired up.
 */
@Processor(QUEUE_NAMES.REPLAYS, { concurrency: 5 })
export class ReplaysPlaceholderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReplaysPlaceholderProcessor.name);
  async process(job: Job): Promise<void> {
    this.logger.warn(
      `Reserved queue 'replays' received job '${job.name}' (id=${job.id}); ` + `no real handler is registered yet.`,
    );
  }
}

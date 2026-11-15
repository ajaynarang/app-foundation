import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';

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

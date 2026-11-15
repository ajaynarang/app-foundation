import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { APP_JOB_NAMES } from '../../../../platform-glue/queue/job-names';

export const REVALIDATE_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Registers the one daily sweep that re-tests every workspace AI credential (`AiCredentialRevalidationHandler`), on
 * the shared `bulk-ops` lane. A FAILING key that passes again goes back to ACTIVE; an ACTIVE key that fails turns
 * FAILING and its owners are told. A queue that is down never blocks boot: the sweep is hygiene.
 */
@Injectable()
export class AiCredentialRevalidationJob implements OnModuleInit {
  private readonly logger = new Logger(AiCredentialRevalidationJob.name);

  constructor(@InjectQueue(QUEUE_NAMES.BULK_OPS) private readonly bulkOps: Queue) {}

  async onModuleInit(): Promise<void> {
    const jobName = APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE;
    try {
      for (const repeatable of await this.bulkOps.getRepeatableJobs()) {
        if (repeatable.name === jobName) await this.bulkOps.removeRepeatableByKey(repeatable.key);
      }
      await this.bulkOps.add(jobName, buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }), {
        jobId: jobName,
        repeat: { every: REVALIDATE_EVERY_MS },
      });
      this.logger.log('Registered the daily AI credential revalidation sweep');
    } catch (err) {
      this.logger.warn(`Could not register the AI credential revalidation sweep: ${(err as Error).message}`);
    }
  }
}

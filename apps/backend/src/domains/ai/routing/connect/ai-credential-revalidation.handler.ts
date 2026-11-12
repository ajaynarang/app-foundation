import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { AiCredentialStatus } from '@appshore/db';
import type { JobEnvelope } from '@app/shared-types';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import type { EventActor } from '@appshore/kernel/infrastructure/events/domain-event';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { APP_JOB_NAMES } from '../../../../platform-glue/queue/job-names';
import { AiCredentialConnectService } from './ai-credential-connect.service';

/** Credentials tested in parallel: each test is a live call of up to 15 seconds. */
export const REVALIDATION_CHUNK = 5;
/** How long one job holds the shared `bulk-ops` lane before it hands over to a continuation. */
export const REVALIDATION_SLICE_MS = 2 * 60 * 1000;
/** The clock the slice reads; a spec binds a fake one. */
export const REVALIDATION_CLOCK = Symbol('REVALIDATION_CLOCK');

const SYSTEM_ACTOR: EventActor = { id: 'system', type: 'system', label: 'scheduled AI credential revalidation' };

interface RevalidationPayload {
  /** Continue after this credential id (a continuation job); absent on the daily start. */
  afterId?: number;
}

/**
 * The daily sweep: re-test every ACTIVE or FAILING workspace AI credential through the same path as "Test again"
 * (`AiCredentialConnectService.validate`), five at a time, in id order. One bad credential never stops the batch.
 *
 * `bulk-ops` runs one job at a time, and the outbox relay and the deadline sweeper wait behind whatever holds it. So the
 * sweep works in slices: after each chunk it checks the clock, and once two minutes have passed it enqueues ONE
 * continuation (same job name, not repeatable, the last id as its cursor) and returns. The relay and sweeper ticks
 * already waiting run before the continuation. Nothing runs while bring-your-own-key is off.
 */
@Injectable()
export class AiCredentialRevalidationHandler implements QueueJobHandler {
  readonly jobNames = [APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE];
  private readonly logger = new Logger(AiCredentialRevalidationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connect: AiCredentialConnectService,
    @InjectQueue(QUEUE_NAMES.BULK_OPS) private readonly bulkOps: Queue,
    @Optional() @Inject(REVALIDATION_CLOCK) private readonly clock: () => number = Date.now,
  ) {}

  async run(job: Job<JobEnvelope<RevalidationPayload>>): Promise<void> {
    if (!this.connect.isEnabled()) {
      this.logger.log('AI credential revalidation skipped: AI_CREDENTIALS_KEY is not set');
      return;
    }
    const now = this.clock ?? Date.now;
    const deadline = now() + REVALIDATION_SLICE_MS;
    let cursor = job.data?.payload?.afterId ?? 0;
    let ok = 0;
    let failed = 0;

    for (;;) {
      const batch = await this.prisma.aiCredential.findMany({
        where: { id: { gt: cursor }, status: { in: [AiCredentialStatus.ACTIVE, AiCredentialStatus.FAILING] } },
        select: { id: true, tenantId: true, publicId: true },
        orderBy: { id: 'asc' },
        take: REVALIDATION_CHUNK + 1,
      });
      const chunk = batch.slice(0, REVALIDATION_CHUNK);
      if (!chunk.length) break;

      await Promise.all(
        chunk.map(async (credential) => {
          try {
            const result = await this.connect.validate(credential.tenantId, credential.publicId, SYSTEM_ACTOR);
            if (result.probe.ok) ok++;
            else failed++;
          } catch (err) {
            failed++;
            this.logger.warn(
              `Revalidation errored for ${credential.publicId} (workspace ${credential.tenantId}): ${(err as Error).message}`,
            );
          }
        }),
      );
      cursor = chunk[chunk.length - 1].id;

      const more = batch.length > REVALIDATION_CHUNK;
      if (!more) break;
      if (now() >= deadline) {
        await this.handOver(cursor);
        this.logger.log(
          `AI credential revalidation slice: ${ok} ok, ${failed} failing or errored; continuing after ${cursor}`,
        );
        return;
      }
    }
    this.logger.log(`AI credential revalidation done: ${ok} ok, ${failed} failing or errored`);
  }

  /** One continuation, not repeatable, with a job id that is never a bare number. */
  private async handOver(afterId: number): Promise<void> {
    const jobName = APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE;
    await this.bulkOps.add(jobName, buildJobEnvelope({ afterId }, { tenantId: 'system', source: 'cron' }), {
      jobId: `${jobName}-after-${afterId}`,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}

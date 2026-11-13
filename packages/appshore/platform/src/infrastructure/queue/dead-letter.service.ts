import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Prisma } from '@appshore/db';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../database/prisma.service';
import { TenantIdResolver } from '../events/tenant-id-resolver.service';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { SYSTEM_JOB_TENANT } from '@appshore/kernel/infrastructure/logging/job-log-context';
import { JOB_EVENTS, toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';

/** Why a dead letter went to the log instead of `dead_letter_logs`. */
export const DEAD_LETTER_UNPERSISTED = {
  SYSTEM_JOB: 'system-job',
  UNRESOLVED_TENANT: 'unresolved-tenant',
} as const;

/**
 * Persists permanent BullMQ job failures (those that have exhausted all
 * retry attempts) into the `dead_letter_logs` table so they survive Bull's
 * 7-day `failed` set retention and can be inspected / replayed by an
 * operator.
 *
 * Safety contract:
 *   - Resilient by design — the database write is wrapped in try/catch and
 *     a persistence failure is logged but never re-thrown. A flaky logging
 *     write must NEVER take down a BullMQ worker.
 *   - A job with no tenant (a system cron) or an unresolvable tenant cannot
 *     get a row: `dead_letter_logs.tenant_id` is a required foreign key. Such a
 *     failure is recorded as one structured `job.dead_letter` log line instead
 *     (no payload: it may carry personal data), so it is still findable.
 *     Crashing the worker on bad job data would cascade.
 *
 * Called by `BaseQueueDispatcher.onFailed` on a job's final failure.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantResolver: TenantIdResolver,
  ) {}

  async recordPermanentFailure(job: Job, error: Error): Promise<void> {
    const envelope = this.extractEnvelope(job);
    if (!envelope || !envelope.tenantId || envelope.tenantId === SYSTEM_JOB_TENANT) {
      this.logUnpersistedDeadLetter(job, error, DEAD_LETTER_UNPERSISTED.SYSTEM_JOB);
      return;
    }

    const tenantDbId = await this.tenantResolver.resolveToDbId(envelope.tenantId);
    if (tenantDbId == null) {
      this.logUnpersistedDeadLetter(job, error, DEAD_LETTER_UNPERSISTED.UNRESOLVED_TENANT, envelope.tenantId);
      return;
    }

    try {
      await this.prisma.deadLetterLog.create({
        data: {
          id: generateUuidV7(),
          tenantId: tenantDbId,
          queueName: job.queueName ?? 'unknown',
          jobName: job.name ?? 'unknown',
          bullJobId: String(job.id ?? 'unknown'),
          correlationId: envelope.correlationId ?? null,
          causationId: envelope.causationId ?? null,
          payload: job.data as Prisma.InputJsonValue,
          errorMessage: error?.message ?? String(error),
          errorStack: error?.stack ?? null,
          attempts: job.attemptsMade ?? 0,
        },
      });
    } catch (persistErr) {
      this.logger.error({
        msg: `Failed to persist dead-letter row for job ${job.id} (${job.name}) on queue ${job.queueName}`,
        jobName: job.name,
        jobId: String(job.id ?? 'unknown'),
        queue: job.queueName,
        err: toLoggableError(persistErr),
        jobErr: toLoggableError(error),
      });
    }
  }

  private logUnpersistedDeadLetter(job: Job, error: Error, reason: string, tenantId?: string): void {
    const jobName = job?.name ?? 'unknown';
    const jobId = String(job?.id ?? 'unknown');
    this.logger.warn({
      msg: `Dead-lettered job ${jobId} (${jobName}) has no tenant row to record against (${reason}); logged only`,
      event: JOB_EVENTS.JOB_DEAD_LETTER,
      jobName,
      jobId,
      queue: job?.queueName,
      tenantId,
      attempt: job?.attemptsMade ?? 0,
      reason,
      err: toLoggableError(error),
    });
  }

  private extractEnvelope(job: Job): JobEnvelope | null {
    const data = job?.data;
    if (!data || typeof data !== 'object') return null;
    return data as JobEnvelope;
  }
}

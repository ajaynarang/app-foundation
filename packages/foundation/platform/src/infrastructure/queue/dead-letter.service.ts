import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Prisma } from '@appshore/db';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../database/prisma.service';
import { TenantIdResolver } from '../events/tenant-id-resolver.service';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';

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
 *   - Skip-and-warn when input is malformed (no envelope, missing tenant,
 *     unresolvable tenant slug). Crashing the worker on bad job data would
 *     cascade.
 *
 * Wired into queue processors in Phase 3.
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
    if (!envelope || !envelope.tenantId) {
      this.logger.warn(
        `Cannot record dead-letter for job ${job?.id ?? 'unknown'} (${job?.name ?? 'unknown'}) — envelope missing tenantId`,
      );
      return;
    }

    const tenantDbId = await this.tenantResolver.resolveToDbId(envelope.tenantId);
    if (tenantDbId == null) {
      this.logger.warn(
        `Cannot record dead-letter for job ${job.id} (${job.name}) — tenant "${envelope.tenantId}" not resolvable to DB id`,
      );
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
      const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
      this.logger.error(
        `Failed to persist dead-letter row for job ${job.id} (${job.name}) on queue ${job.queueName}: ${msg}. Original error: ${error?.message ?? String(error)}`,
      );
    }
  }

  private extractEnvelope(job: Job): JobEnvelope | null {
    const data = job?.data;
    if (!data || typeof data !== 'object') return null;
    return data as JobEnvelope;
  }
}

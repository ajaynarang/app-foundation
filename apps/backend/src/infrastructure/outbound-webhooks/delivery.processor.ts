import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import axios from 'axios';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../database/prisma.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { DeadLetterService } from '../queue/dead-letter.service';
import { withJobLogContext } from '../logging/job-log-context';

/**
 * Inner payload shape for a webhook delivery job. Producers wrap this in a
 * standard `JobEnvelope` via `buildJobEnvelope` before enqueueing.
 */
export interface WebhookDeliveryPayload {
  subscriptionId: string;
  logId: string;
  payload: {
    id: string;
    event: string;
    version?: number;
    tenantId: string;
    timestamp: string;
    actor?: { id: string; type: string; label?: string } | null;
    data: unknown;
  };
}

/**
 * @deprecated Use `WebhookDeliveryPayload` (the inner payload type) together
 * with `JobEnvelope<WebhookDeliveryPayload>` for the full job-data shape.
 * Kept as a type alias to ease the producer migration.
 */
export type WebhookDeliveryJobData = WebhookDeliveryPayload;

class WebhookHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Webhook delivery failed with HTTP ${status}`);
    this.name = 'WebhookHttpError';
  }
}

@Processor(QUEUE_NAMES.WEBHOOKS, { concurrency: 5 })
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  computeSignature(secret: string, body: string): string {
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    return `sha256=${hex}`;
  }

  async process(job: Job<JobEnvelope<WebhookDeliveryPayload>>): Promise<void> {
    // `withJobLogContext` reads `tenantId` straight off `job.data`, which
    // matches the envelope shape (envelope.tenantId is the wire-format slug).
    return withJobLogContext(job, async () => this.handle(job));
  }

  private async handle(job: Job<JobEnvelope<WebhookDeliveryPayload>>): Promise<void> {
    const { subscriptionId, logId, payload } = job.data.payload;
    const isFinalAttempt = job.attemptsMade >= (job.opts?.attempts ?? 3) - 1;

    // Tenant pause guard. payload.tenantId is the wire-format slug
    // (normalized in DurableEventProcessor), but defend against legacy jobs
    // that may have been queued before the resolver landed (numeric form).
    if (payload.tenantId) {
      const where =
        typeof payload.tenantId === 'string' && isNaN(Number(payload.tenantId))
          ? { tenantId: payload.tenantId }
          : { id: Number(payload.tenantId) };
      const tenant = await this.prisma.tenant.findUnique({
        where,
        select: { jobsPaused: true },
      });
      if (tenant?.jobsPaused) {
        this.logger.log(`Skipping webhook delivery — tenant ${payload.tenantId} is paused`);
        return;
      }
    }

    const subscription = await this.prisma.webhookSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription || !subscription.active) {
      this.logger.warn(`Skipping delivery for inactive/missing subscription ${subscriptionId}`);
      return;
    }

    const body = JSON.stringify(payload);
    const signature = this.computeSignature(subscription.secret, body);

    try {
      const response = await axios.post(subscription.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.event,
          'X-Webhook-Delivery': logId,
          'X-Webhook-Event-Version': String(payload.version ?? 1),
        },
        timeout: 10_000,
        validateStatus: () => true, // handle all statuses manually below
      });

      const isSuccess = response.status >= 200 && response.status < 300;
      const responseBody =
        typeof response.data === 'object'
          ? JSON.stringify(response.data).slice(0, 1000)
          : String(response.data).slice(0, 1000);

      if (isSuccess) {
        await this.prisma.webhookDeliveryLog.update({
          where: { id: logId },
          data: {
            responseStatus: response.status,
            responseBody,
            attempts: { increment: 1 },
            deliveredAt: new Date(),
          },
        });
        this.logger.log(`Delivered ${payload.event} to ${subscription.url} → ${response.status}`);
      } else {
        // Non-2xx: log the failure and throw to trigger BullMQ retry
        this.logger.warn(`Delivery got ${response.status} for ${logId}`);
        await this.prisma.webhookDeliveryLog.update({
          where: { id: logId },
          data: {
            attempts: { increment: 1 },
            responseStatus: response.status,
            responseBody,
            ...(isFinalAttempt ? { failedAt: new Date() } : {}),
          },
        });
        throw new WebhookHttpError(response.status);
      }
    } catch (error) {
      // Only network errors reach here (axios never throws for HTTP errors when validateStatus: () => true)
      // But re-thrown WebhookHttpError from our non-2xx block above also passes through here.
      // Avoid double-logging/double-updating for those.
      if (error instanceof WebhookHttpError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Network error for ${logId}: ${message}`);
      await this.prisma.webhookDeliveryLog.update({
        where: { id: logId },
        data: {
          attempts: { increment: 1 },
          responseStatus: null,
          responseBody: message.slice(0, 1000),
          ...(isFinalAttempt ? { failedAt: new Date() } : {}),
        },
      });
      throw error;
    }
  }

  /**
   * When a webhook delivery job has exhausted all its retry attempts, persist
   * a row into `dead_letter_logs` so the failure survives Bull's 7-day
   * `failed` set retention and can be inspected / replayed by an operator.
   * Intermediate failures (where BullMQ will retry) are skipped.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<JobEnvelope<WebhookDeliveryPayload>>, err: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      await this.deadLetter.recordPermanentFailure(job, err);
    }
  }
}

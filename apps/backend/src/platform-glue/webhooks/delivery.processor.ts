import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import axios from 'axios';
import type { JobEnvelope } from '@app/shared-types';
import {
  assertDeliverableWebhookUrl,
  createSafeWebhookAgents,
  isUnsafeWebhookTargetError,
} from '@appshore/kernel/infrastructure/outbound-webhooks/webhook-url.validator';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';
import { withJobContext } from '@appshore/kernel/infrastructure/logging/job-log-context';
import { buildWebhookHeaders, signingSecrets } from './standard-webhooks';
import { stripQueryString } from '@appshore/kernel/shared/utils/log-redaction';

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

const DELIVERY_TIMEOUT_MS = 10_000;

@Processor(QUEUE_NAMES.WEBHOOKS, { concurrency: 5 })
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  private readonly allowPrivate: boolean;
  /** Every connection resolves through the SSRF guard: a host that resolves to a private address is refused. */
  private readonly agents: ReturnType<typeof createSafeWebhookAgents>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deadLetter: DeadLetterService,
    config: ConfigService,
  ) {
    super();
    this.allowPrivate = config.get<boolean>('webhooks.allowPrivateTargets') === true;
    this.agents = createSafeWebhookAgents({ allowPrivate: this.allowPrivate });
  }

  async process(job: Job<JobEnvelope<WebhookDeliveryPayload>>): Promise<void> {
    // `withJobContext` reads `tenantId` straight off `job.data`, which
    // matches the envelope shape (envelope.tenantId is the wire-format slug).
    return withJobContext(job, async () => this.handle(job));
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
    // The delivery log id is the message id (stable across retries, so receivers can de-duplicate); the timestamp
    // is this attempt's, so receivers can refuse replays.
    const headers = buildWebhookHeaders(signingSecrets(subscription), {
      id: logId,
      timestamp: Math.floor(Date.now() / 1000),
      body,
      event: payload.event,
      eventVersion: payload.version ?? 1,
    });

    let response: { status: number; data: unknown };
    try {
      response = await this.send(subscription.url, body, headers);
    } catch (error) {
      if (isUnsafeWebhookTargetError(error)) return this.refuse(logId, subscription.url, error);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Network error for ${logId}: ${message}`);
      await this.recordAttempt(logId, { responseStatus: null, responseBody: message.slice(0, 1000) }, isFinalAttempt);
      throw error;
    }

    const responseBody = (
      typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data)
    ).slice(0, 1000);
    if (response.status >= 200 && response.status < 300) {
      await this.prisma.webhookDeliveryLog.update({
        where: { id: logId },
        data: { responseStatus: response.status, responseBody, attempts: { increment: 1 }, deliveredAt: new Date() },
      });
      this.logger.log(`Delivered ${payload.event} to ${stripQueryString(subscription.url)} → ${response.status}`);
      return;
    }
    // Non-2xx, a 3xx included (redirects are never followed): record it and throw so BullMQ retries.
    this.logger.warn(`Delivery got ${response.status} for ${logId}`);
    await this.recordAttempt(logId, { responseStatus: response.status, responseBody }, isFinalAttempt);
    throw new WebhookHttpError(response.status);
  }

  /** One POST through the SSRF guard: literal hosts are checked here, resolved addresses by the safe agents. */
  private send(url: string, body: string, headers: Record<string, string>) {
    assertDeliverableWebhookUrl(url, { allowPrivate: this.allowPrivate });
    return axios.post(url, body, {
      headers,
      timeout: DELIVERY_TIMEOUT_MS,
      // Never follow a redirect: a 3xx is a failed delivery, not a way into another host.
      maxRedirects: 0,
      // No environment proxy: the safe agents must make the connection themselves.
      proxy: false,
      httpAgent: this.agents.httpAgent,
      httpsAgent: this.agents.httpsAgent,
      validateStatus: () => true, // every status is handled by the caller
    });
  }

  private async recordAttempt(
    logId: string,
    result: { responseStatus: number | null; responseBody: string },
    isFinalAttempt: boolean,
  ): Promise<void> {
    await this.prisma.webhookDeliveryLog.update({
      where: { id: logId },
      data: { attempts: { increment: 1 }, ...result, ...(isFinalAttempt ? { failedAt: new Date() } : {}) },
    });
  }

  /** The target is not (or is no longer) a public address. Retrying cannot help, so fail it now, visibly. */
  private async refuse(logId: string, url: string, error: unknown): Promise<never> {
    const reason = `Refused: ${error instanceof Error ? error.message : 'the webhook URL is not a public address'}`;
    this.logger.warn(`Refused delivery ${logId} to ${stripQueryString(url)}: ${reason}`);
    await this.recordAttempt(logId, { responseStatus: null, responseBody: reason.slice(0, 1000) }, true);
    throw new UnrecoverableError(reason);
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
    if (job.attemptsMade >= maxAttempts || err instanceof UnrecoverableError) {
      await this.deadLetter.recordPermanentFailure(job, err);
    }
  }
}

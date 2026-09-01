import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppCacheService } from '../../../cache/app-cache.service';
import { DEFAULT_PLATFORM_TIMEZONE, PLATFORM_TIMEZONE } from '../../../../config/platform-timezone';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { DeliveryStatus } from '@appshore/db';
import { PrismaService } from '../../../database/prisma.service';
import { FeatureFlagsService } from '../../../../domains/feature-flags/feature-flags.service';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DeliveryLedgerService } from '../../pipeline/delivery-ledger.service';
import { DELIVERY_SKIP_REASONS } from '../../pipeline/delivery-outcome';
import { WHATSAPP_PORT, WhatsAppSendError, type WhatsAppPort } from './whatsapp.port';
import {
  WHATSAPP_DAILY_COUNTER_TTL_SECONDS,
  WHATSAPP_DAILY_SEND_CEILING_DEFAULT,
  WHATSAPP_FEATURE_FLAG,
  WHATSAPP_SEND_JOB_NAME,
} from './whatsapp.constants';
import type { WhatsAppSendJobPayload } from './whatsapp-dispatch.service';

export type { WhatsAppSendJobPayload } from './whatsapp-dispatch.service';

/** The platform's day, not the server's: the ceiling resets at midnight IST. */
const calendarDay = (now: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const dailySendCounterKey = (now: Date, timeZone: string): string =>
  `whatsapp:sends:${calendarDay(now, timeZone)}`;

/**
 * Sends one queued WhatsApp. At-least-once safe: the row is CLAIMED before the
 * provider is called, so a job redelivered after a crash mid-send finds the
 * claim and does not send twice — the provider's webhook settles that row.
 */
@Injectable()
export class WhatsAppSendHandler implements QueueJobHandler {
  readonly jobNames = [WHATSAPP_SEND_JOB_NAME];
  private readonly logger = new Logger(WhatsAppSendHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: DeliveryLedgerService,
    @Inject(WHATSAPP_PORT) private readonly whatsapp: WhatsAppPort,
    private readonly featureFlags: FeatureFlagsService,
    private readonly cache: AppCacheService,
    private readonly config: ConfigService,
    @Optional() @Inject(PLATFORM_TIMEZONE) private readonly platformTimezone: string = DEFAULT_PLATFORM_TIMEZONE,
  ) {}

  private dailyCeiling(): number {
    const raw = this.config.get<string>('WHATSAPP_DAILY_SEND_CEILING');
    const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : WHATSAPP_DAILY_SEND_CEILING_DEFAULT;
  }

  async run(job: Job<JobEnvelope<WhatsAppSendJobPayload>>): Promise<void> {
    const { deliveryId, userId, send } = job.data.payload;

    const row = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { status: true },
    });
    if (!row) {
      this.logger.warn(`WhatsApp job ${deliveryId} has no ledger row — nothing to send`);
      return;
    }
    if (row.status !== DeliveryStatus.QUEUED) return;

    if (!(await this.featureFlags.isEnabled(WHATSAPP_FEATURE_FLAG))) {
      await this.ledger.markSkipped(deliveryId, DELIVERY_SKIP_REASONS.FLAG_OFF);
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    if (!user?.phone) {
      await this.ledger.markSkipped(deliveryId, DELIVERY_SKIP_REASONS.NO_ADDRESS);
      return;
    }

    const attempt = job.attemptsMade + 1;
    // One unit per DELIVERY, charged on its first attempt: a retry is the same
    // message, not another one. Zero is a real ceiling — the kill switch.
    if (attempt === 1) {
      const ceiling = this.dailyCeiling();
      const sentToday = await this.cache.increment(
        dailySendCounterKey(new Date(), this.platformTimezone),
        1,
        WHATSAPP_DAILY_COUNTER_TTL_SECONDS,
      );
      if (sentToday > ceiling) {
        this.logger.error(`WhatsApp daily ceiling of ${ceiling} reached — ${deliveryId} skipped`);
        await this.ledger.markSkipped(deliveryId, DELIVERY_SKIP_REASONS.CEILING);
        return;
      }
    }
    if (!(await this.ledger.claimSend(deliveryId, attempt))) {
      this.logger.warn(`WhatsApp send ${deliveryId} was already attempted — leaving it to the webhook`);
      return;
    }

    try {
      const { providerMessageId } = await this.whatsapp.sendTemplate({
        to: user.phone,
        ...send,
        callbackData: deliveryId,
      });
      await this.ledger.markSent(deliveryId, providerMessageId, attempt);
    } catch (err) {
      const retryable = err instanceof WhatsAppSendError && err.retryable;
      const last = attempt >= (job.opts.attempts ?? 1);
      if (retryable && !last) {
        await this.ledger.releaseClaim(deliveryId, attempt + 1);
        throw err;
      }
      this.logger.warn(`WhatsApp send ${deliveryId} failed for good on attempt ${attempt}: ${(err as Error).message}`);
      const reason =
        err instanceof WhatsAppSendError && err.failureReason
          ? err.failureReason
          : DELIVERY_SKIP_REASONS.PROVIDER_ERROR;
      await this.ledger.markFailed(deliveryId, reason, attempt);
    }
  }
}

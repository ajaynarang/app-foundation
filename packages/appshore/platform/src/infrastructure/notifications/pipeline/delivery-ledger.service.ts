import { Injectable, Logger } from '@nestjs/common';
import { DeliveryChannel, DeliveryStatus, NotificationType, Prisma } from '@appshore/db';
import { PrismaService } from '../../database/prisma.service';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { DELIVERY_SKIP_REASONS, type ChannelOutcome, type DeliverySkipReason } from './delivery-outcome';

export interface RecipientOutcomes {
  userId: number;
  outcomes: ChannelOutcome[];
}

/** ~50 recipients of four channels. One DB blip loses one chunk, not the trigger. */
const ROWS_PER_INSERT = 200;

/**
 * Which stored statuses a provider event may advance. Anything else is stale or
 * a replay. FAILED cannot follow DELIVERED: once a message is on the device the
 * provider has nothing left to fail — such an event is out of order.
 */
const ADVANCES_FROM: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  [DeliveryStatus.SENT]: [DeliveryStatus.QUEUED],
  [DeliveryStatus.DELIVERED]: [DeliveryStatus.QUEUED, DeliveryStatus.SENT],
  [DeliveryStatus.READ]: [DeliveryStatus.QUEUED, DeliveryStatus.SENT, DeliveryStatus.DELIVERED],
  [DeliveryStatus.FAILED]: [DeliveryStatus.QUEUED, DeliveryStatus.SENT],
};

/** The only writer of notification_deliveries. */
@Injectable()
export class DeliveryLedgerService {
  private readonly logger = new Logger(DeliveryLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * One write for the whole audience of a trigger, after the fan-out — never
   * per recipient inside the loop. A 200-entrant draw publish runs inside the
   * organizer's request; 200 serial inserts there is the N+1 Phase 0 removed.
   */
  async recordOutcomes(params: {
    tenantId: number;
    type: NotificationType;
    recipients: RecipientOutcomes[];
  }): Promise<void> {
    const now = new Date();
    const rows = params.recipients.flatMap((recipient) =>
      recipient.outcomes.map((outcome) => ({
        id: outcome.deliveryId ?? generateUuidV7(),
        tenantId: params.tenantId,
        userId: recipient.userId,
        type: params.type,
        channel: outcome.channel,
        status: outcome.status,
        failureReason: outcome.failureReason ?? null,
        sentAt: outcome.status === DeliveryStatus.SENT ? now : null,
      })),
    );

    // One line per trigger for the WhatsApp channel — what the Grafana panel reads.
    const whatsapp = rows.filter((row) => row.channel === DeliveryChannel.WHATSAPP);
    if (whatsapp.length > 0) {
      const count = (status: DeliveryStatus) => whatsapp.filter((row) => row.status === status).length;
      this.logger.log({
        msg: 'whatsapp-ledger',
        type: params.type,
        queued: count(DeliveryStatus.QUEUED),
        skipped: count(DeliveryStatus.SKIPPED),
        failed: count(DeliveryStatus.FAILED),
      });
    }

    for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
      try {
        await this.prisma.notificationDelivery.createMany({ data: rows.slice(start, start + ROWS_PER_INSERT) });
      } catch (err: any) {
        // The messages already went (or didn't); losing the record of them is
        // the lesser failure. Ids in the log line, never addresses.
        this.logger.error(`Ledger write failed for ${params.type} in tenant ${params.tenantId}: ${err.message}`);
      }
    }
  }

  /**
   * Take a QUEUED row for sending. `sentAt` on a still-QUEUED row means "a send
   * was attempted, outcome unknown": a job redelivered after the provider
   * accepted but before we recorded it must NOT send again — the provider's
   * webhook, matched by callback data, settles the row instead.
   */
  async claimSend(id: string, attemptCount: number): Promise<boolean> {
    const { count } = await this.prisma.notificationDelivery.updateMany({
      where: { id, status: DeliveryStatus.QUEUED, sentAt: null },
      data: { sentAt: new Date(), attemptCount },
    });
    return count > 0;
  }

  /** Nothing was sent (the provider refused before accepting) — hand the row back for the retry. */
  async releaseClaim(id: string, attemptCount: number): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      where: { id, status: DeliveryStatus.QUEUED },
      data: { sentAt: null, attemptCount },
    });
  }

  /**
   * Advances QUEUED → SENT. If the provider's webhook got there first the row
   * is already DELIVERED, READ or FAILED — that wins; only the provider id is
   * filled in.
   */
  async markSent(id: string, providerMessageId: string, attemptCount: number): Promise<void> {
    const { count } = await this.prisma.notificationDelivery.updateMany({
      where: { id, status: DeliveryStatus.QUEUED },
      data: { status: DeliveryStatus.SENT, providerMessageId, attemptCount, sentAt: new Date(), failureReason: null },
    });
    if (count === 0) {
      await this.prisma.notificationDelivery.updateMany({
        where: { id, providerMessageId: null },
        data: { providerMessageId, attemptCount },
      });
    }
  }

  async markFailed(id: string, failureReason: DeliverySkipReason, attemptCount: number): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status: DeliveryStatus.FAILED, failureReason, attemptCount },
    });
  }

  async markSkipped(id: string, failureReason: DeliverySkipReason): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status: DeliveryStatus.SKIPPED, failureReason },
    });
  }

  /**
   * A provider's status callback, applied monotonically: a late SENT never
   * overwrites DELIVERED, a replay is a no-op. Matches the provider id, or our
   * own ledger id echoed back as callback data — the latter is how a send whose
   * acknowledgement we lost still gets its provider id. Returns whether a row moved.
   */
  async applyProviderStatus(params: {
    providerMessageId: string;
    status: DeliveryStatus;
    at: Date;
    failureReason?: DeliverySkipReason;
    callbackData?: string;
  }): Promise<boolean> {
    const advancesFrom = ADVANCES_FROM[params.status];
    if (!advancesFrom) return false;

    const stamp: Prisma.NotificationDeliveryUpdateManyMutationInput = {
      status: params.status,
      providerMessageId: params.providerMessageId,
    };
    if (params.status === DeliveryStatus.SENT) stamp.sentAt = params.at;
    if (params.status === DeliveryStatus.DELIVERED) stamp.deliveredAt = params.at;
    if (params.status === DeliveryStatus.READ) stamp.readAt = params.at;
    if (params.status === DeliveryStatus.FAILED) {
      stamp.failureReason = params.failureReason ?? DELIVERY_SKIP_REASONS.PROVIDER_ERROR;
    }

    const { count } = await this.prisma.notificationDelivery.updateMany({
      where: {
        channel: DeliveryChannel.WHATSAPP,
        status: { in: advancesFrom },
        OR: [
          { providerMessageId: params.providerMessageId },
          ...(params.callbackData ? [{ id: params.callbackData, providerMessageId: null }] : []),
        ],
      },
      data: stamp,
    });
    return count > 0;
  }

  /**
   * QUEUED rows stranded before `olderThan`. Never-ran rows age from creation;
   * claimed rows age from the claim — a row that queued through a backlog and
   * went out minutes ago still has its webhook coming.
   */
  async staleQueued(params: { olderThan: Date; claimed: boolean; limit?: number }): Promise<{ id: string }[]> {
    return this.prisma.notificationDelivery.findMany({
      where: {
        channel: DeliveryChannel.WHATSAPP,
        status: DeliveryStatus.QUEUED,
        ...(params.claimed
          ? { sentAt: { lt: params.olderThan } }
          : { createdAt: { lt: params.olderThan }, sentAt: null }),
      },
      select: { id: true },
      take: params.limit ?? 200,
    });
  }

  async markQueueLost(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.notificationDelivery.updateMany({
      where: { id: { in: ids }, status: DeliveryStatus.QUEUED },
      data: { status: DeliveryStatus.FAILED, failureReason: DELIVERY_SKIP_REASONS.QUEUE_LOST },
    });
    return count;
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.notificationDelivery.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
  }
}

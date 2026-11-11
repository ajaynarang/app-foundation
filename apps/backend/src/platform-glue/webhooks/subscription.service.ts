import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { WEBHOOK_SECRET_OVERLAP_DEFAULT_HOURS } from '@app/shared-types';
import { assertSafeWebhookTarget } from '@appshore/kernel/infrastructure/outbound-webhooks/webhook-url.validator';
import { getExternalEventsByCategory } from '../events/event-registry';
import { QUEUE_NAMES, WEBHOOKS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { WebhookDeliveryPayload } from './delivery.processor';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { ReplayWebhookDto } from './dto/replay-webhook.dto';
import { RotateWebhookSecretDto } from './dto/rotate-webhook-secret.dto';
import { generateWebhookSecret } from './standard-webhooks';
import { invalidState } from '@appshore/kernel/shared/errors/api-errors';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class WebhookSubscriptionService {
  private readonly logger = new Logger(WebhookSubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS)
    private readonly deliveryQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  /** The URL and every address its host resolves to must be public (the delivery worker checks again on send). */
  private assertSafeTarget(url: string): Promise<void> {
    return assertSafeWebhookTarget(url, {
      allowPrivate: this.config.get<boolean>('webhooks.allowPrivateTargets') === true,
    });
  }

  async create(
    tenantId: number,
    data: {
      url: string;
      events: string[];
      description?: string;
    },
  ) {
    await this.assertSafeTarget(data.url);

    const secret = generateWebhookSecret();

    const subscription = await this.prisma.webhookSubscription.create({
      data: {
        tenantId,
        url: data.url,
        events: data.events,
        description: data.description,
        secret,
      },
    });

    // Return secret only on creation — it will never be shown again via any other endpoint.
    // Callers must store this value securely; there is no way to retrieve it.
    return {
      id: subscription.id,
      tenantId: subscription.tenantId,
      url: subscription.url,
      events: subscription.events,
      active: subscription.active,
      description: subscription.description,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      signingSecret: subscription.secret, // shown once — store securely
    };
  }

  async findAll(tenantId: number, pagination: { limit: number; offset: number }) {
    const where = { tenantId, active: true };
    const [subscriptions, total] = await Promise.all([
      this.prisma.webhookSubscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
        select: {
          id: true,
          tenantId: true,
          url: true,
          events: true,
          active: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          previousSecretExpiresAt: true,
          _count: { select: { deliveryLogs: true } },
        },
      }),
      this.prisma.webhookSubscription.count({ where }),
    ]);
    return { subscriptions, total };
  }

  /** Scoped by tenant in the read itself: another tenant's subscription is 404, the same as a missing one. */
  async findOne(tenantId: number, id: string) {
    const sub = await this.prisma.webhookSubscription.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        url: true,
        events: true,
        active: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        previousSecretExpiresAt: true,
        _count: { select: { deliveryLogs: true } },
      },
    });
    if (!sub) throw new NotFoundException('Webhook subscription not found');
    return sub;
  }

  async update(
    tenantId: number,
    id: string,
    data: {
      url?: string;
      events?: string[];
      active?: boolean;
      description?: string;
    },
  ) {
    await this.findOne(tenantId, id);
    // `!== undefined`, not truthiness: an empty url must reach the guard and be refused, not be saved.
    if (data.url !== undefined) await this.assertSafeTarget(data.url);
    return this.prisma.webhookSubscription.update({
      where: { id },
      data,
      select: {
        id: true,
        tenantId: true,
        url: true,
        events: true,
        active: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async softDelete(tenantId: number, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.webhookSubscription.update({
      where: { id },
      data: { active: false },
      select: {
        id: true,
        tenantId: true,
        url: true,
        events: true,
        active: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Issue a new signing secret (shown once). The old one keeps signing alongside it for `overlapHours` (default 24),
   * so a receiver can deploy the new secret without dropping a delivery; 0 retires it at once.
   */
  async rotateSecret(tenantId: number, id: string, dto: RotateWebhookSecretDto) {
    const current = await this.prisma.webhookSubscription.findFirst({
      where: { id, tenantId },
      select: { secret: true },
    });
    if (!current) throw new NotFoundException('Webhook subscription not found');

    const overlapHours = dto.overlapHours ?? WEBHOOK_SECRET_OVERLAP_DEFAULT_HOURS;
    const secret = generateWebhookSecret();
    const previousSecretExpiresAt = overlapHours > 0 ? new Date(Date.now() + overlapHours * HOUR_MS) : null;
    // Conditional on the secret just read: of two concurrent rotations only one wins, so nobody is shown a secret
    // that was overwritten before it ever signed.
    const updated = await this.prisma.webhookSubscription.updateMany({
      where: { id, tenantId, secret: current.secret },
      data: { secret, previousSecret: overlapHours > 0 ? current.secret : null, previousSecretExpiresAt },
    });
    if (updated.count === 0) {
      throw new ConflictException('The secret was just rotated. Refresh and try again.');
    }

    this.logger.log(`Rotated the signing secret of webhook ${id} (overlap ${overlapHours}h)`);
    const { _count: _deliveries, ...subscription } = await this.findOne(tenantId, id);
    return { ...subscription, signingSecret: secret }; // shown once: store securely
  }

  async findLogs(
    tenantId: number,
    id: string,
    pagination: {
      limit: number;
      offset: number;
      dateFrom?: string | null;
      dateTo?: string | null;
    },
  ) {
    await this.findOne(tenantId, id);
    const createdAt: Record<string, Date> = {};
    if (pagination.dateFrom) createdAt.gte = new Date(`${pagination.dateFrom}T00:00:00.000Z`);
    if (pagination.dateTo) createdAt.lte = new Date(`${pagination.dateTo}T23:59:59.999Z`);
    const where = {
      subscriptionId: id,
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };
    const [logs, total] = await Promise.all([
      this.prisma.webhookDeliveryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      this.prisma.webhookDeliveryLog.count({ where }),
    ]);
    return { logs, total };
  }

  getEventCatalog() {
    return { categories: getExternalEventsByCategory() };
  }

  async retryDelivery(tenantId: number, subscriptionId: string, logId: string) {
    await this.findOne(tenantId, subscriptionId);
    const log = await this.prisma.webhookDeliveryLog.findUnique({
      where: { id: logId },
    });

    if (!log || log.subscriptionId !== subscriptionId) {
      throw new NotFoundException('Delivery log not found');
    }
    if (!log.failedAt) {
      throw invalidState('Only failed deliveries can be retried');
    }

    // Reset the failure first: a worker that fails it again (a refused target, say) must not be overwritten.
    const pending = await this.prisma.webhookDeliveryLog.update({
      where: { id: logId },
      data: { failedAt: null },
    });

    const innerPayload = log.payload as WebhookDeliveryPayload['payload'];
    const jobPayload: WebhookDeliveryPayload = {
      subscriptionId,
      logId: log.id,
      payload: innerPayload,
    };

    try {
      await this.deliveryQueue.add(
        WEBHOOKS_JOB_NAMES.DELIVER,
        buildJobEnvelope(jobPayload, {
          // The original payload carries the wire-format tenant slug; reuse it
          // so the worker (and dead-letter logger) sees the same identifier.
          tenantId: String(innerPayload?.tenantId ?? tenantId),
          source: 'replay',
        }),
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
    } catch (error) {
      // No job stands behind the row: put the failure back, or it reads as pending for ever and the next retry is
      // refused as "not failed".
      await this.prisma.webhookDeliveryLog
        .update({ where: { id: logId }, data: { failedAt: log.failedAt } })
        .catch(() => this.logger.error(`Could not restore the failed state of webhook delivery ${logId}`));
      throw error;
    }

    // 202 with the record to poll: the delivery as it is now, pending again.
    return pending;
  }

  /** One delivery of a subscription: the 202 body of queued work (`POST …/test`). */
  async getDeliveryLog(tenantId: number, subscriptionId: string, logId: string) {
    const log = await this.prisma.webhookDeliveryLog.findFirst({
      where: { id: logId, subscriptionId, subscription: { tenantId } },
    });
    if (!log) throw new NotFoundException('Delivery log not found');
    return log;
  }

  async replayEvents(tenantId: number, subscriptionId: string, dto: ReplayWebhookDto) {
    const sub = await this.findOne(tenantId, subscriptionId);
    const since = new Date(dto.since);
    const limit = dto.limit ?? 1000;

    const where: Prisma.DomainEventLogWhereInput = {
      tenantId,
      createdAt: { gte: since },
    };
    if (dto.events && dto.events.length > 0) {
      where.event = { in: dto.events };
    }

    // Only replay events the subscription is actually subscribed to
    const subEvents = (sub as any).events as string[];
    if (!subEvents.includes('*')) {
      if (dto.events && dto.events.length > 0) {
        // Intersect user-requested events with subscription's events
        where.event = { in: dto.events.filter((e) => subEvents.includes(e)) };
      } else {
        where.event = { in: subEvents };
      }
    }

    // Include the tenant slug — the outbound webhook payload identifies the
    // tenant by its public slug, never by the internal Int DB id.
    const events = await this.prisma.domainEventLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { tenant: { select: { tenantId: true } } },
    });

    let queued = 0;
    for (const event of events) {
      // Strip bridge-internal SSE routing fields before sending to subscribers.
      // recipientUserIds, if present, is internal to DomainEventSseBridge and
      // must never reach external HTTP endpoints.
      const eventData = event.data as unknown;
      const redactedData =
        eventData && typeof eventData === 'object' && !Array.isArray(eventData) && 'recipientUserIds' in eventData
          ? (() => {
              const { recipientUserIds: _stripped, ...rest } = eventData as Record<string, unknown>;
              return rest;
            })()
          : eventData;

      const payload = {
        id: event.id,
        event: event.event,
        version: event.version,
        tenantId: event.tenant.tenantId,
        timestamp: event.createdAt.toISOString(),
        actor: event.actorId
          ? {
              id: event.actorId,
              type: event.actorType,
              label: event.actorLabel,
            }
          : null,
        data: redactedData as Prisma.InputJsonValue,
      };

      const log = await this.prisma.webhookDeliveryLog.create({
        data: {
          id: generateUuidV7(),
          subscriptionId,
          event: event.event,
          payload,
        },
      });

      await this.deliveryQueue.add(
        WEBHOOKS_JOB_NAMES.DELIVER,
        buildJobEnvelope({ subscriptionId, logId: log.id, payload } satisfies WebhookDeliveryPayload, {
          tenantId: event.tenant.tenantId,
          source: 'replay',
          causationId: event.id,
        }),
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
      queued++;
    }

    // 202: how many deliveries were queued, to follow in the log.
    return { queued, since: since.toISOString() };
  }
}

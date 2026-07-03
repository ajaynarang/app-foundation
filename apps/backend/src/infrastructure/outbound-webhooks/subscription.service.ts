import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@appshore/db';
import { PrismaService } from '../database/prisma.service';
import { randomBytes } from 'crypto';
import { assertSafeWebhookUrl } from './webhook-url.validator';
import { getExternalEventsByCategory } from '../events/event-registry';
import { QUEUE_NAMES, WEBHOOKS_JOB_NAMES } from '../queue/queue.constants';
import { buildJobEnvelope } from '../queue/job-envelope.helper';
import { WebhookDeliveryPayload } from './delivery.processor';
import { generateUuidV7 } from '../../shared/utils/uuidv7';
import { ReplayWebhookDto } from './dto/replay-webhook.dto';

@Injectable()
export class WebhookSubscriptionService {
  private readonly logger = new Logger(WebhookSubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS)
    private readonly deliveryQueue: Queue,
  ) {}

  async create(
    tenantId: number,
    data: {
      url: string;
      events: string[];
      description?: string;
    },
  ) {
    assertSafeWebhookUrl(data.url);

    const secret = randomBytes(32).toString('hex');

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
          _count: { select: { deliveryLogs: true } },
        },
      }),
      this.prisma.webhookSubscription.count({ where }),
    ]);
    return { subscriptions, total };
  }

  async findOne(tenantId: number, id: string) {
    const sub = await this.prisma.webhookSubscription.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        url: true,
        events: true,
        active: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { deliveryLogs: true } },
      },
    });
    if (!sub) throw new NotFoundException('Webhook subscription not found');
    if (sub.tenantId !== tenantId) throw new ForbiddenException();
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
    if (data.url) assertSafeWebhookUrl(data.url);
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
      throw new BadRequestException('Only failed deliveries can be retried');
    }

    const innerPayload = log.payload as WebhookDeliveryPayload['payload'];
    const jobPayload: WebhookDeliveryPayload = {
      subscriptionId,
      logId: log.id,
      payload: innerPayload,
    };

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

    // Reset failure state for retry
    await this.prisma.webhookDeliveryLog.update({
      where: { id: logId },
      data: { failedAt: null },
    });

    return { message: 'Delivery queued for retry' };
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

    return { message: `${queued} events queued for replay` };
  }
}

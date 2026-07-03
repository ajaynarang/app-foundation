import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@appshore/db';
import { randomUUID } from 'crypto';
import { DomainEvent } from '../events/domain-event';
import { getEventDefinition } from '../events/event-registry';
import { PrismaService } from '../database/prisma.service';
import { QUEUE_NAMES, WEBHOOKS_JOB_NAMES } from '../queue/queue.constants';
import { buildJobEnvelope } from '../queue/job-envelope.helper';
import { WebhookDeliveryPayload } from './delivery.processor';
import { generateUuidV7 } from '../../shared/utils/uuidv7';

/**
 * Strip bridge-internal SSE routing fields from an event's data before
 * serializing to outbound webhook subscribers. `recipientUserIds` is used
 * by DomainEventSseBridge to fan out user-scoped SSE delivery; it must
 * never leak to external HTTP endpoints.
 */
function redactWebhookData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  if ('recipientUserIds' in obj) {
    const { recipientUserIds: _stripped, ...rest } = obj;
    return rest;
  }
  return obj;
}

@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS)
    private readonly deliveryQueue: Queue,
  ) {}

  async dispatchEvent(event: DomainEvent): Promise<void> {
    try {
      // Skip internal events — they should not be delivered to webhook subscribers
      const eventDef = getEventDefinition(event.event);
      if (eventDef?.visibility === 'internal') return;

      // DomainEvent.tenantId is the wire-format slug (it must stay the slug
      // because external webhook payloads identify the tenant by slug).
      // WebhookSubscription.tenantId is the Int DB id, so resolve once per
      // dispatch.
      const tenant = await this.prisma.tenant.findUnique({
        where: { tenantId: event.tenantId },
        select: { id: true },
      });
      if (!tenant) {
        this.logger.warn(`Skipping webhook dispatch for ${event.event}: tenant slug "${event.tenantId}" not found`);
        return;
      }

      const subscriptions = await this.prisma.webhookSubscription.findMany({
        where: {
          tenantId: tenant.id,
          active: true,
          OR: [{ events: { has: '*' } }, { events: { has: event.event } }],
        },
      });

      if (subscriptions.length === 0) return;

      this.logger.debug(
        `Dispatching ${event.event} to ${subscriptions.length} subscription(s) for tenant ${event.tenantId}`,
      );

      const payload = {
        id: event.id,
        event: event.event,
        version: event.version,
        tenantId: event.tenantId,
        timestamp: event.timestamp.toISOString(),
        actor: event.actor
          ? {
              id: event.actor.id,
              type: event.actor.type,
              label: event.actor.label ?? null,
            }
          : null,
        data: redactWebhookData(event.data) as Prisma.InputJsonValue,
      };

      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            const log = await this.prisma.webhookDeliveryLog.create({
              data: {
                id: generateUuidV7(),
                subscriptionId: sub.id,
                event: event.event,
                payload,
              },
            });

            const jobPayload: WebhookDeliveryPayload = {
              subscriptionId: sub.id,
              logId: log.id,
              payload,
            };

            await this.deliveryQueue.add(
              WEBHOOKS_JOB_NAMES.DELIVER,
              buildJobEnvelope(jobPayload, {
                tenantId: String(event.tenantId),
                source: 'event',
                causationId: event.id,
              }),
              {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 30_000,
                },
              },
            );
          } catch (subError) {
            const msg = subError instanceof Error ? subError.message : String(subError);
            this.logger.error(`Failed to dispatch ${event.event} to subscription ${sub.id}: ${msg}`);
            // Attempt to mark the log as failed if it was created
            // (best-effort; if log creation itself failed this is a no-op)
          }
        }),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`WebhookDispatcher failed for event ${event.event} (tenant ${event.tenantId}): ${msg}`);
    }
  }

  async deliverToSubscription(subscriptionId: string, eventName: string, data: unknown): Promise<void> {
    try {
      const sub = await this.prisma.webhookSubscription.findUnique({
        where: { id: subscriptionId },
        include: { tenant: { select: { tenantId: true } } },
      });
      if (!sub || !sub.active) return;

      // Outbound payloads ship the public tenant slug, not the internal Int PK.
      const payload = {
        id: randomUUID(),
        event: eventName,
        tenantId: sub.tenant.tenantId,
        timestamp: new Date().toISOString(),
        data: redactWebhookData(data) as Prisma.InputJsonValue,
      };

      const log = await this.prisma.webhookDeliveryLog.create({
        data: { id: generateUuidV7(), subscriptionId, event: eventName, payload },
      });

      await this.deliveryQueue.add(
        WEBHOOKS_JOB_NAMES.DELIVER,
        buildJobEnvelope({ subscriptionId, logId: log.id, payload } satisfies WebhookDeliveryPayload, {
          tenantId: sub.tenant.tenantId,
          source: 'api',
        }),
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`deliverToSubscription failed for subscription ${subscriptionId} event ${eventName}: ${msg}`);
    }
  }
}

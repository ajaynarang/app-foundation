import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { TenantIdResolver } from '@appshore/platform/infrastructure/events/tenant-id-resolver.service';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';
import { DOMAIN_EVENTS } from '../domain-events.constants';
import { DurableEventProcessor } from '../durable-event.processor';
import { EventPersistenceSubscriber } from '../event-persistence.subscriber';
import { WebhookDispatcher, webhookDeliveryJobId } from '../../webhooks/dispatcher.service';
import { CacheInvalidationSubscriber } from '../../cache/cache-invalidation.subscriber';
import { DomainEventSseBridge } from '../../sse/domain-event-sse-bridge.service';

/**
 * Delivery is at least once (ADR "Outbox and deadlines"): a crash after publish and before the outbox row is
 * marked publishes the same event again, and a failed durable job retries. This spec publishes ONE event
 * TWICE through the real listeners and consumers, and runs every durable job twice, and holds what each
 * consumer promises on a second delivery:
 *
 * - durable enqueue: one job, keyed on the event name and id;
 * - event log: one row, keyed on the event id;
 * - outbound webhooks: one delivery-log row and one delivery job per subscription;
 * - in-process listeners (cache invalidation, SSE bridge): run again and never throw.
 */

/** A BullMQ queue reduced to the one rule this spec leans on: an add whose job id it holds is ignored. */
function fakeQueue() {
  const jobs = new Map<string, { name: string; data: unknown }>();
  return {
    jobs,
    add: jest.fn(async (name: string, data: unknown, opts: { jobId?: string } = {}) => {
      const id = opts.jobId ?? `auto-${jobs.size + 1}`;
      if (!jobs.has(id)) jobs.set(id, { name, data });
      return { id };
    }),
  };
}

function fakePrisma() {
  const eventLog = new Map<string, unknown>();
  const deliveryLogs: Array<{ id: string; subscriptionId: string; payload: { id: string } }> = [];
  return {
    eventLog,
    deliveryLogs,
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
    webhookSubscription: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'sub-a', tenantId: 1, url: 'https://a.example', events: ['*'], active: true },
        { id: 'sub-b', tenantId: 1, url: 'https://b.example', events: [DOMAIN_EVENTS.TENANT_UPDATED], active: true },
      ]),
    },
    domainEventLog: {
      upsert: jest.fn(async ({ where, create }: { where: { id: string }; create: unknown }) => {
        if (!eventLog.has(where.id)) eventLog.set(where.id, create);
        return eventLog.get(where.id);
      }),
    },
    webhookDeliveryLog: {
      findFirst: jest.fn(
        async ({ where }: { where: { subscriptionId: string; payload: { path: string[]; equals: string } } }) => {
          const row = deliveryLogs.find(
            (log) => log.subscriptionId === where.subscriptionId && log.payload.id === where.payload.equals,
          );
          return row ? { id: row.id, deliveredAt: null, failedAt: null } : null;
        },
      ),
      create: jest.fn(async ({ data }: { data: { id: string; subscriptionId: string; payload: { id: string } } }) => {
        deliveryLogs.push(data);
        return data;
      }),
    },
  };
}

describe('one event delivered twice', () => {
  async function make() {
    const prisma = fakePrisma();
    const eventsQueue = fakeQueue();
    const webhooksQueue = fakeQueue();
    const cache = { del: jest.fn().mockResolvedValue(undefined), delByPrefix: jest.fn().mockResolvedValue(0) };
    const sse = { emitToTenant: jest.fn(), emitToUser: jest.fn() };
    const tenants = {
      resolveToSlug: jest.fn().mockResolvedValue('acme'),
      resolveToDbId: jest.fn().mockResolvedValue(1),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', ignoreErrors: false })],
      providers: [
        DomainEventService,
        DurableEventProcessor,
        EventPersistenceSubscriber,
        WebhookDispatcher,
        CacheInvalidationSubscriber,
        // The bridge's SSE transport is a stub; it is built here so this spec never names the transport class.
        { provide: DomainEventSseBridge, useFactory: () => new DomainEventSseBridge(sse as never) },
        { provide: PrismaService, useValue: prisma },
        { provide: AppCacheService, useValue: cache },
        { provide: TenantIdResolver, useValue: tenants },
        { provide: DeadLetterService, useValue: { recordPermanentFailure: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.EVENTS), useValue: eventsQueue },
        { provide: getQueueToken(QUEUE_NAMES.WEBHOOKS), useValue: webhooksQueue },
      ],
    }).compile();
    await moduleRef.init();

    const cacheListener = jest.spyOn(moduleRef.get(CacheInvalidationSubscriber), 'handleDomainEvent');
    const sseListener = jest.spyOn(moduleRef.get(DomainEventSseBridge), 'handleDomainEvent');

    return {
      moduleRef,
      prisma,
      eventsQueue,
      webhooksQueue,
      cache,
      sse,
      cacheListener,
      sseListener,
      events: moduleRef.get(DomainEventService),
      processor: moduleRef.get(DurableEventProcessor),
    };
  }

  /** Let the `async: true` listeners finish. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('holds one durable job, one log row and one delivery per subscription, and the listeners never throw', async () => {
    const t = await make();
    const event = new DomainEvent(DOMAIN_EVENTS.TENANT_UPDATED, '1', { tenantId: 1, companyName: 'Acme' });

    // The request path publishes it; then the relay publishes it again (a crash before the mark).
    await t.events.publish(event);
    await t.events.publish(event);
    await settle();

    // Durable enqueue: added twice, held once, keyed on the event.
    expect(t.eventsQueue.add).toHaveBeenCalledTimes(2);
    expect([...t.eventsQueue.jobs.keys()]).toEqual([`${DOMAIN_EVENTS.TENANT_UPDATED}-${event.id}`]);

    // The durable job runs, and then runs again (a BullMQ retry after a later step failed).
    const [job] = [...t.eventsQueue.jobs.values()];
    for (let run = 0; run < 2; run++) {
      await t.processor.process({ id: 'j1', name: job.name, data: job.data } as unknown as Job<never>);
    }

    // Event log: one row, under the event's own id.
    expect([...t.prisma.eventLog.keys()]).toEqual([event.id]);

    // Outbound webhooks: one log row and one delivery job per subscription, the payload id is the event id.
    expect(t.prisma.deliveryLogs.map((log) => log.subscriptionId).sort()).toEqual(['sub-a', 'sub-b']);
    expect(t.prisma.deliveryLogs.every((log) => log.payload.id === event.id)).toBe(true);
    expect([...t.webhooksQueue.jobs.keys()].sort()).toEqual(
      [webhookDeliveryJobId(event.id, 'sub-a'), webhookDeliveryJobId(event.id, 'sub-b')].sort(),
    );

    // In-process listeners: each ran once per publish and resolved; a second run is a second refetch signal.
    expect(t.cacheListener).toHaveBeenCalledTimes(2);
    expect(t.sseListener).toHaveBeenCalledTimes(2);
    await expect(Promise.all(t.cacheListener.mock.results.map((r) => r.value))).resolves.toBeDefined();
    for (const result of t.sseListener.mock.results) expect(result.type).toBe('return');
    expect(t.cache.del).toHaveBeenCalled();
    expect(t.sse.emitToTenant).toHaveBeenCalledTimes(2);

    await t.moduleRef.close();
  });
});

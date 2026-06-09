import { Test } from '@nestjs/testing';
import { EventPersistenceSubscriber } from '../event-persistence.subscriber';
import { PrismaService } from '../../database/prisma.service';
import { TenantIdResolver } from '../tenant-id-resolver.service';
import { DomainEvent } from '../domain-event';

describe('EventPersistenceSubscriber', () => {
  let subscriber: EventPersistenceSubscriber;
  let prisma: {
    domainEventLog: { upsert: jest.Mock };
  };
  let tenantResolver: { resolveToDbId: jest.Mock };

  beforeEach(async () => {
    prisma = {
      domainEventLog: { upsert: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    };
    tenantResolver = {
      resolveToDbId: jest.fn().mockResolvedValue(7),
    };

    const module = await Test.createTestingModule({
      providers: [
        EventPersistenceSubscriber,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantIdResolver, useValue: tenantResolver },
      ],
    }).compile();

    subscriber = module.get(EventPersistenceSubscriber);
  });

  /** Helper to extract the `create` payload from the upsert call */
  function getUpsertCreate(): Record<string, any> {
    return prisma.domainEventLog.upsert.mock.calls[0][0].create;
  }

  it('persists tenantId as Int FK to Tenant.id', async () => {
    tenantResolver.resolveToDbId.mockResolvedValue(42);
    const event = new DomainEvent('app.load.created', 'demo-northstar-2026', { entityId: 'LD-1' });

    await subscriber.persistEvent(event);

    expect(tenantResolver.resolveToDbId).toHaveBeenCalledWith('demo-northstar-2026');
    const create = getUpsertCreate();
    expect(create.tenantId).toBe(42);
    expect(typeof create.tenantId).toBe('number');
  });

  it('persists event with entityId from standardized payload', async () => {
    const event = new DomainEvent(
      'app.load.created',
      'demo-northstar-2026',
      { entityId: 'LD-123', entityType: 'load', loadNumber: 'LD-123' },
      { id: 'user-1', type: 'user', label: 'John' },
      'corr-1',
    );

    await subscriber.persistEvent(event);

    const create = getUpsertCreate();
    expect(create.id).toBe(event.id);
    expect(create.tenantId).toBe(7);
    expect(create.event).toBe('app.load.created');
    expect(create.aggregateType).toBe('load');
    expect(create.aggregateId).toBe('LD-123');
    expect(create.actorId).toBe('user-1');
    expect(create.actorType).toBe('user');
    expect(create.actorLabel).toBe('John');
    expect(create.correlationId).toBe('corr-1');
    expect(create.version).toBe(1);
  });

  it('falls back to legacy ID fields when entityId missing', async () => {
    const event = new DomainEvent('app.load.created', 'demo-northstar-2026', {
      loadId: 'LD-456',
    });

    await subscriber.persistEvent(event);

    expect(getUpsertCreate().aggregateId).toBe('LD-456');
  });

  it('extracts driverId from payload', async () => {
    const event = new DomainEvent('app.driver.created', 'demo-northstar-2026', {
      driverId: 'DRV-100',
    });

    await subscriber.persistEvent(event);

    const create = getUpsertCreate();
    expect(create.aggregateId).toBe('DRV-100');
    expect(create.aggregateType).toBe('driver');
  });

  it('sets aggregateId to null when no ID found', async () => {
    const event = new DomainEvent('app.sync.started', 'demo-northstar-2026', {
      jobId: 'job-1',
    });

    await subscriber.persistEvent(event);

    expect(getUpsertCreate().aggregateId).toBeNull();
  });

  it('infers aggregateType from event key when not in registry', async () => {
    const event = new DomainEvent('app.unknown-entity.created', 'demo-northstar-2026', {});

    await subscriber.persistEvent(event);

    expect(getUpsertCreate().aggregateType).toBe('unknown-entity');
  });

  it('sets actor fields to null when no actor provided', async () => {
    const event = new DomainEvent('app.load.created', 'demo-northstar-2026', {});

    await subscriber.persistEvent(event);

    const create = getUpsertCreate();
    expect(create.actorId).toBeNull();
    expect(create.actorType).toBeNull();
    expect(create.actorLabel).toBeNull();
    expect(create.correlationId).toBeNull();
    expect(create.causationId).toBeNull();
  });

  it('does not throw on persistence failure (fire-and-forget)', async () => {
    prisma.domainEventLog.upsert.mockRejectedValue(new Error('DB down'));
    const event = new DomainEvent('app.load.created', 'demo-northstar-2026', {});

    await expect(subscriber.persistEvent(event)).resolves.not.toThrow();
  });

  it('handles null data gracefully', async () => {
    const event = new DomainEvent('app.load.created', 'demo-northstar-2026', null as any);

    await subscriber.persistEvent(event);

    const create = getUpsertCreate();
    expect(create.aggregateId).toBeNull();
    expect(create.data).toEqual({});
  });

  it('skips persistence when tenant cannot be resolved', async () => {
    tenantResolver.resolveToDbId.mockResolvedValue(null);

    const event = new DomainEvent('app.load.created', 'unknown-tenant', {});

    await subscriber.persistEvent(event);

    expect(prisma.domainEventLog.upsert).not.toHaveBeenCalled();
  });

  it('upsert uses event.id as where clause (idempotent)', async () => {
    const event = new DomainEvent('app.load.created', 'demo-northstar-2026', {});

    await subscriber.persistEvent(event);

    const call = prisma.domainEventLog.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ id: event.id });
    expect(call.update).toEqual({});
  });
});

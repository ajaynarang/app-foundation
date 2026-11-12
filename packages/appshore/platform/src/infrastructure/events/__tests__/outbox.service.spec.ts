import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { EventContext } from '@appshore/kernel/infrastructure/events/event-context';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { OUTBOX_TRANSACTION_TIMEOUT_MAX_MS, OutboxService } from '../outbox.service';
import { OUTBOX_COLUMN_MAX, fromOutboxRow, toOutboxRow } from '../outbox-row';

describe('OutboxService', () => {
  function make() {
    const prisma = createMockPrisma();
    prisma.outboxEvent.create.mockResolvedValue({});
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    const events = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new OutboxService(prisma as never, events as never);
    return { prisma, events, service };
  }
  const actor = { id: '7', type: 'user' as const, label: 'Ana' };

  describe('transaction', () => {
    it('stages each emit as a row on the transaction, then publishes after commit and marks them published', async () => {
      const { prisma, events, service } = make();

      const result = await service.transaction(async (tx, emit) => {
        expect(tx).toBe(prisma); // the mock $transaction hands the client through
        await emit('app.widget.created', 10, { widgetId: 'w-1' }, actor);
        await emit('app.widget.updated', 10, { widgetId: 'w-1' }, actor, { correlationId: 'c-1' });
        expect(events.publish).not.toHaveBeenCalled(); // nothing leaves before the commit
        return 'done';
      });

      expect(result).toBe('done');
      expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(2);
      const rows = prisma.outboxEvent.create.mock.calls.map((c: [{ data: Record<string, unknown> }]) => c[0].data);
      expect(rows[0]).toMatchObject({
        event: 'app.widget.created',
        tenantId: '10',
        data: { widgetId: 'w-1' },
        actorId: '7',
        actorType: 'user',
        actorLabel: 'Ana',
        correlationId: null,
      });
      expect(rows[1]).toMatchObject({ event: 'app.widget.updated', correlationId: 'c-1' });

      const published = events.publish.mock.calls.map((c: [DomainEvent]) => c[0]);
      expect(published.map((e) => e.event)).toEqual(['app.widget.created', 'app.widget.updated']);
      // The published event IS the staged row: same id, same timestamp.
      expect(published[0].id).toBe(rows[0].id);
      expect(published[0].timestamp).toBe(rows[0].occurredAt);
      expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [rows[0].id, rows[1].id] }, publishedAt: null },
        data: { publishedAt: expect.any(Date) },
      });
    });

    it('passes transaction options through', async () => {
      const { prisma, service } = make();
      await service.transaction(async () => undefined, { timeout: 15_000 });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
    });

    it('caps a longer timeout so the relay grace always outlasts the transaction', async () => {
      const { prisma, service } = make();
      await service.transaction(async () => undefined, { timeout: 60_000, maxWait: 2_000 });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: OUTBOX_TRANSACTION_TIMEOUT_MAX_MS,
        maxWait: 2_000,
      });
    });

    it('stages an over-long actor label and ids capped to their columns, never failing the write', async () => {
      const { prisma, service } = make();
      const label = `${'a'.repeat(140)}@example.com`; // 152 chars — a legal users.email (255)
      const longId = 'c'.repeat(80);
      await service.transaction(async (_tx, emit) => {
        await emit(
          'app.widget.updated',
          10,
          {},
          { id: '7', type: 'user', label },
          {
            correlationId: longId,
            causationId: longId,
          },
        );
      });
      const row = prisma.outboxEvent.create.mock.calls[0][0].data;
      expect(row.actorLabel).toBe(label); // fits the widened column whole
      expect(row.correlationId).toHaveLength(OUTBOX_COLUMN_MAX.correlationId);
      expect(row.causationId).toHaveLength(OUTBOX_COLUMN_MAX.causationId);

      const huge = 'x'.repeat(400);
      const capped = toOutboxRow(new DomainEvent('app.x', '1', {}, { id: huge, type: 'user', label: huge }));
      expect(capped.actorLabel).toHaveLength(OUTBOX_COLUMN_MAX.actorLabel);
      expect(capped.actorId).toHaveLength(OUTBOX_COLUMN_MAX.actorId);
    });

    it('publishes nothing when the transaction rolls back', async () => {
      const { events, prisma, service } = make();

      await expect(
        service.transaction(async (_tx, emit) => {
          await emit('app.widget.created', 10, {});
          throw new Error('conflict');
        }),
      ).rejects.toThrow('conflict');

      expect(events.publish).not.toHaveBeenCalled();
      expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
    });

    it('does not touch the outbox when nothing was emitted', async () => {
      const { events, prisma, service } = make();
      await service.transaction(async () => 1);
      expect(events.publish).not.toHaveBeenCalled();
      expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
    });

    it('resolves the actor from EventContext when none is given', async () => {
      const { prisma, service } = make();
      await EventContext.run({ id: 'svc', type: 'system' }, () =>
        service.transaction(async (_tx, emit) => emit('app.x.happened', 'global', {})),
      );
      expect(prisma.outboxEvent.create.mock.calls[0][0].data).toMatchObject({
        tenantId: 'global',
        actorId: 'svc',
        actorType: 'system',
        actorLabel: null,
      });
    });
  });

  describe('publishStaged', () => {
    it('never fails the caller: a publish failure stops the run and leaves the rest for the relay', async () => {
      const { events, prisma, service } = make();
      const a = new DomainEvent('app.a', '1', {});
      const b = new DomainEvent('app.b', '1', {});
      const c = new DomainEvent('app.c', '1', {});
      events.publish.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Redis down'));

      await expect(service.publishStaged([a, b, c])).resolves.toBeUndefined();

      expect(events.publish).toHaveBeenCalledTimes(2); // c never overtakes b
      expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [a.id] }, publishedAt: null },
        data: { publishedAt: expect.any(Date) },
      });
    });

    it('marks nothing when the first publish fails', async () => {
      const { events, prisma, service } = make();
      events.publish.mockRejectedValue('boom');
      await service.publishStaged([new DomainEvent('app.a', '1', {})]);
      expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
    });

    it('swallows a failed mark-published (the relay re-sends; consumers key on the id)', async () => {
      const { prisma, service } = make();
      prisma.outboxEvent.updateMany.mockRejectedValue(new Error('db gone'));
      await expect(service.publishStaged([new DomainEvent('app.a', '1', {})])).resolves.toBeUndefined();
    });
  });

  describe('stage', () => {
    it('writes the row on the caller’s transaction and returns the event for publishStaged', async () => {
      const { prisma, service, events } = make();
      const tx = { outboxEvent: { create: jest.fn().mockResolvedValue({}) } };

      const event = await service.stage(tx as never, 'app.y', 5, { n: 1 }, actor, { causationId: 'cause' });

      expect(event.event).toBe('app.y');
      expect(event.tenantId).toBe('5');
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: toOutboxRow(event) });
      expect(tx.outboxEvent.create.mock.calls[0][0].data.causationId).toBe('cause');
      expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('outbox rows', () => {
    it('round-trips an event through its row unchanged', () => {
      const event = new DomainEvent('app.z', '3', { a: [1, 2] }, actor, 'corr', 'cause');
      const row = {
        ...toOutboxRow(event),
        publishedAt: null,
        attempts: 0,
        leaseExpiresAt: null,
        lastError: null,
        createdAt: new Date(),
      };

      const back = fromOutboxRow(row as never);

      expect(back).toBeInstanceOf(DomainEvent);
      expect(back).toMatchObject({
        id: event.id,
        event: 'app.z',
        tenantId: '3',
        data: { a: [1, 2] },
        actor,
        correlationId: 'corr',
        causationId: 'cause',
        version: 1,
      });
      expect(back.timestamp).toBe(event.timestamp);
    });

    it('leaves actor_agent empty: the column is reserved for machine identity and nothing writes it yet', () => {
      expect(toOutboxRow(new DomainEvent('app.z', '3', {}, actor)).actorAgent).toBeUndefined();
      expect(toOutboxRow(new DomainEvent('app.z', '3', {})).actorAgent).toBeUndefined();
    });

    it('restores a row without an actor or correlation', () => {
      const event = DomainEvent.restore({ id: 'e', event: 'app.q', tenantId: '1', data: {}, timestamp: new Date() });
      const back = fromOutboxRow({ ...toOutboxRow(event), actorType: null } as never);
      expect(back.actor).toBeUndefined();
      expect(back.correlationId).toBeUndefined();
      expect(back.causationId).toBeUndefined();
    });

    it('keeps a row whose actor type was lost as a system actor', () => {
      const event = DomainEvent.restore({ id: 'e', event: 'app.q', tenantId: '1', data: {}, timestamp: new Date() });
      const back = fromOutboxRow({ ...toOutboxRow(event), actorId: 'x', actorType: null, actorLabel: null } as never);
      expect(back.actor).toEqual({ id: 'x', type: 'system' });
    });
  });
});

import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { Logger } from '@nestjs/common';
import { currentRls, runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import {
  OUTBOX_RELAY_BATCH,
  OUTBOX_RELAY_GRACE_MS,
  OUTBOX_RELAY_LEASE_MS,
  OUTBOX_RETENTION_DAYS,
  OutboxRelay,
} from '../outbox-relay.service';
import { OutboxRelayJobHandler } from '../outbox-relay.handler';
import { OUTBOX_TRANSACTION_TIMEOUT_MAX_MS } from '../outbox.service';

/** The SQL text of a tagged-template raw call, and its bound values. */
function rawCall(mock: jest.Mock, index = 0): { sql: string; values: unknown[] } {
  const [strings, ...values] = mock.mock.calls[index] as [TemplateStringsArray, ...unknown[]];
  return { sql: strings.join('?').replace(/\s+/g, ' ').trim(), values };
}

function row(id: string, occurredAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    event: 'app.widget.expired',
    tenantId: '10',
    data: { widgetId: 'w-9' },
    actorId: null,
    actorType: null,
    actorLabel: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(occurredAt),
    publishedAt: null,
    attempts: 1,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: new Date(occurredAt),
    ...extra,
  };
}

describe('OutboxRelay', () => {
  const now = new Date('2026-10-09T12:00:00.000Z');

  function make() {
    const prisma = createMockPrisma();
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 0 });
    prisma.outboxEvent.update.mockResolvedValue({});
    const events = { publish: jest.fn().mockResolvedValue(undefined) };
    const tenants = { resolveToDbId: jest.fn().mockResolvedValue(null) };
    const relay = new OutboxRelay(prisma as never, events as never, tenants as never);
    return { prisma, events, relay, tenants };
  }

  it('waits out the longest outbox transaction before calling a row abandoned (occurredAt is stamped at staging)', () => {
    // A row staged at the start of a transaction that commits at its timeout is visible only then; the
    // request path publishes it right after. The grace must outlast that, with room for the publish.
    expect(OUTBOX_RELAY_GRACE_MS).toBeGreaterThanOrEqual(2 * OUTBOX_TRANSACTION_TIMEOUT_MAX_MS);
    expect(OUTBOX_RELAY_GRACE_MS).toBeLessThan(OUTBOX_RELAY_LEASE_MS);
  });

  describe('relay', () => {
    it('claims past the grace period with SKIP LOCKED and a lease, oldest first', async () => {
      const { prisma, relay } = make();

      const result = await relay.relay(now);

      expect(result).toEqual({ claimed: 0, published: 0, failed: 0 });
      const { sql, values } = rawCall(prisma.$queryRaw);
      expect(sql).toContain('UPDATE outbox_events SET lease_expires_at = ?, attempts = attempts + 1');
      expect(sql).toContain('WHERE published_at IS NULL AND occurred_at < ?');
      expect(sql).toContain('AND (lease_expires_at IS NULL OR lease_expires_at < ?)');
      expect(sql).toContain('ORDER BY occurred_at LIMIT ? FOR UPDATE SKIP LOCKED');
      expect(sql).toContain('RETURNING id');
      expect(values).toEqual([
        new Date(now.getTime() + OUTBOX_RELAY_LEASE_MS),
        new Date(now.getTime() - OUTBOX_RELAY_GRACE_MS),
        now,
        OUTBOX_RELAY_BATCH,
      ]);
      expect(prisma.outboxEvent.findMany).not.toHaveBeenCalled(); // nothing claimed, nothing read
    });

    it('publishes claimed rows in occurred order with their own id and marks them published', async () => {
      const { prisma, events, relay } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'b' }, { id: 'a' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([
        row('a', '2026-10-09T11:00:00Z', { actorId: '7', actorType: 'user', actorLabel: 'Ana', correlationId: 'c' }),
        row('b', '2026-10-09T11:01:00Z'),
      ]);

      const result = await relay.relay(now);

      expect(result).toEqual({ claimed: 2, published: 2, failed: 0 });
      expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['b', 'a'] }, publishedAt: null },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });
      const published = events.publish.mock.calls.map((c) => c[0]);
      expect(published.map((e) => e.id)).toEqual(['a', 'b']);
      expect(published[0]).toMatchObject({
        event: 'app.widget.expired',
        tenantId: '10',
        data: { widgetId: 'w-9' },
        actor: { id: '7', type: 'user', label: 'Ana' },
        correlationId: 'c',
        timestamp: new Date('2026-10-09T11:00:00Z'),
      });
      expect(published[1].actor).toBeUndefined();
      expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] } },
        data: { publishedAt: expect.any(Date), leaseExpiresAt: null, lastError: null },
      });
    });

    it('records the error on a row that fails and still publishes the rows after it', async () => {
      const { prisma, events, relay } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([
        row('a', '2026-10-09T11:00:00Z'),
        row('b', '2026-10-09T11:01:00Z'),
      ]);
      events.publish.mockRejectedValueOnce(new Error('x'.repeat(600)));

      const result = await relay.relay(now);

      expect(result).toEqual({ claimed: 2, published: 1, failed: 1 });
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { lastError: 'x'.repeat(500) },
      });
      expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['b'] } } }),
      );
    });

    it('marks nothing when every claimed row fails (they retry after the lease)', async () => {
      const { prisma, events, relay } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([row('a', '2026-10-09T11:00:00Z')]);
      events.publish.mockRejectedValue('redis unreachable');

      expect(await relay.relay(now)).toEqual({ claimed: 1, published: 0, failed: 1 });
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { lastError: 'redis unreachable' },
      });
      expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
    });

    it('skips a claimed row another publisher marked in the meantime', async () => {
      const { prisma, events, relay } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([]); // publishedAt: null filter excluded it

      expect(await relay.relay(now)).toEqual({ claimed: 1, published: 0, failed: 0 });
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('purge', () => {
    it('deletes published rows past retention in bounded batches until a short batch', async () => {
      const { prisma, relay } = make();
      prisma.$executeRaw.mockResolvedValueOnce(1_000).mockResolvedValueOnce(12);

      expect(await relay.purge(now)).toBe(1_012);

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      const { sql, values } = rawCall(prisma.$executeRaw);
      expect(sql).toContain(
        'DELETE FROM outbox_events WHERE id IN ( SELECT id FROM outbox_events WHERE published_at < ?',
      );
      expect(values[0]).toEqual(new Date(now.getTime() - OUTBOX_RETENTION_DAYS * 86_400_000));
    });

    it('stops after the per-tick cap', async () => {
      const { prisma, relay } = make();
      prisma.$executeRaw.mockResolvedValue(1_000);

      expect(await relay.purge(now)).toBe(10_000);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(10);
    });
  });

  describe('tick', () => {
    it('relays then purges and reports both', async () => {
      const { prisma, relay } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([row('a', '2026-10-09T11:00:00Z')]);
      prisma.$executeRaw.mockResolvedValue(3);

      expect(await relay.tick(now)).toEqual({ claimed: 1, published: 1, failed: 0, purged: 3 });
    });

    it('is quiet when there is nothing to do', async () => {
      const { relay } = make();
      expect(await relay.tick()).toEqual({ claimed: 0, published: 0, failed: 0, purged: 0 });
    });
  });

  describe('tenant context', () => {
    /** Records the context each publish runs in. */
    function recordPublishes(events: { publish: jest.Mock }) {
      const seen: Array<{ id: string; ctx: unknown }> = [];
      events.publish.mockImplementation(async (event: { id: string }) => {
        await new Promise((resolve) => setImmediate(resolve));
        seen.push({ id: event.id, ctx: currentRls() });
      });
      return seen;
    }

    it('claims and purges in the outbox-relay system scope', async () => {
      const { prisma, relay } = make();
      const scopes: unknown[] = [];
      prisma.$queryRaw.mockImplementation(async () => {
        scopes.push(currentRls());
        return [];
      });
      prisma.$executeRaw.mockImplementation(async () => {
        scopes.push(currentRls());
        return 0;
      });

      await relay.tick(now);

      expect(scopes).toEqual([
        { kind: 'system', reason: 'outbox-relay' },
        { kind: 'system', reason: 'outbox-relay' },
      ]);
    });

    it("publishes each event as its emitter's tenant, a numeric id or a public id resolved to one", async () => {
      const { prisma, events, relay, tenants } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([
        row('a', '2026-10-09T11:00:00Z', { tenantId: '10' }),
        row('b', '2026-10-09T11:01:00Z', { tenantId: 'acme-co' }),
      ]);
      tenants.resolveToDbId.mockResolvedValue(12);
      const seen = recordPublishes(events);

      await relay.tick(now);

      expect(tenants.resolveToDbId).toHaveBeenCalledWith('acme-co');
      expect(seen).toEqual([
        { id: 'a', ctx: { kind: 'tenant', tenantId: 10, source: 'event:app.widget.expired' } },
        { id: 'b', ctx: { kind: 'tenant', tenantId: 12, source: 'event:app.widget.expired' } },
      ]);
    });

    it('publishes an event with no tenant in the public scope', async () => {
      const { prisma, events, relay } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([
        row('a', '2026-10-09T11:00:00Z', { tenantId: '' }),
        row('b', '2026-10-09T11:01:00Z', { tenantId: 'system' }),
      ]);
      const seen = recordPublishes(events);

      await relay.tick(now);

      expect(seen.map((s) => s.ctx)).toEqual([
        { kind: 'public', source: 'event:app.widget.expired' },
        { kind: 'public', source: 'event:app.widget.expired' },
      ]);
    });

    it('publishes an event whose public id names no tenant with no context, and warns', async () => {
      const { prisma, events, relay } = make();
      prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
      prisma.outboxEvent.findMany.mockResolvedValue([row('a', '2026-10-09T11:00:00Z', { tenantId: 'gone-co' })]);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const seen = recordPublishes(events);

      expect(await relay.relay(now)).toEqual({ claimed: 1, published: 1, failed: 0 });
      expect(seen).toEqual([{ id: 'a', ctx: undefined }]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('names no known tenant'));
      warn.mockRestore();
    });

    it('refuses to run inside a tenant request (strict mode)', async () => {
      const { relay } = make();
      await expect(runAsTenant(7, 'jwt', () => relay.tick(now))).rejects.toThrow(/system scope \(outbox-relay\)/);
    });
  });
});

describe('OutboxRelayJobHandler', () => {
  it('owns outbox-relay and runs one relay tick', async () => {
    const relay = { tick: jest.fn().mockResolvedValue({ claimed: 0, published: 0, failed: 0, purged: 0 }) };
    const handler = new OutboxRelayJobHandler(relay as never);

    expect(handler.jobNames).toEqual([BULK_OPS_JOB_NAMES.OUTBOX_RELAY]);
    await expect(handler.run({ id: 'r1', name: BULK_OPS_JOB_NAMES.OUTBOX_RELAY, data: {} } as never)).resolves.toEqual({
      claimed: 0,
      published: 0,
      failed: 0,
      purged: 0,
    });
    expect(relay.tick).toHaveBeenCalledTimes(1);
  });
});

import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import type { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { OutboxRelay, OUTBOX_RETENTION_DAYS } from '@appshore/platform/infrastructure/events/outbox-relay.service';
import { toOutboxRow } from '@appshore/platform/infrastructure/events/outbox-row';

/**
 * The outbox on a real Postgres (ADR "Outbox and deadlines"): the unit specs hold the logic with a mock client;
 * this one holds the parts only a database can — a rollback really leaves no row, and the relay's raw claim
 * (`FOR UPDATE SKIP LOCKED` with a lease) and purge SQL run against the migrated table.
 *
 * Skipped when DATABASE_URL is unset or names no usable database (unreachable, login refused, no such database, not
 * migrated).
 */
// No default: the purge case deletes every published row past retention in the database it is given, so it runs
// only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

const NO_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'P1000',
  'P1001',
  'P1003',
  'P1010',
  'P2021',
]);

function isNoDatabase(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code !== undefined && NO_DATABASE_CODES.has(code);
}

const EVENT = 'app.outbox-integration.probe';
const DAY_MS = 86_400_000;

describe('outbox on a real database', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;
  const published: DomainEvent[] = [];
  const events = {
    publish: jest.fn(async (event: DomainEvent) => {
      published.push(event);
    }),
  } as unknown as DomainEventService;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('outbox.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.outboxEvent.deleteMany({ where: { event: EVENT } });
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`outbox.integration: no usable database (${(err as Error).message}) — skipping`);
    }
  }, 30_000);

  afterAll(async () => {
    if (usable) await prisma.outboxEvent.deleteMany({ where: { event: EVENT } });
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  beforeEach(() => {
    published.length = 0;
  });

  it('a committed transaction leaves a published row; a rolled-back one leaves none and publishes nothing', async () => {
    if (!usable) return;
    const outbox = new OutboxService(prisma as never, events);

    await outbox.transaction(async (_tx, emit) => emit(EVENT, 1, { n: 1 }));
    await expect(
      outbox.transaction(async (_tx, emit) => {
        await emit(EVENT, 1, { n: 2 });
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');

    const rows = await prisma.outboxEvent.findMany({ where: { event: EVENT } });
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toEqual({ n: 1 });
    expect(rows[0].publishedAt).toBeInstanceOf(Date);
    expect(published.map((e) => e.id)).toEqual([rows[0].id]);
  });

  it('the relay claims what a crash left unpublished, publishes it with its own id, and never claims it twice', async () => {
    if (!usable) return;
    await prisma.outboxEvent.deleteMany({ where: { event: EVENT } });
    const now = new Date();
    const stale = new DomainEvent(EVENT, '1', { n: 3 });
    const fresh = new DomainEvent(EVENT, '1', { n: 4 });
    // A row staged five minutes ago and never published (the process died after commit), and one just staged.
    await prisma.outboxEvent.create({
      data: { ...toOutboxRow(stale), occurredAt: new Date(now.getTime() - 5 * 60_000) },
    });
    await prisma.outboxEvent.create({ data: toOutboxRow(fresh) });

    const relay = new OutboxRelay(prisma as never, events);
    const [first, second] = await Promise.all([relay.relay(now), relay.relay(now)]);

    // Two relays at once: SKIP LOCKED and the lease hand the stale row to exactly one of them.
    expect(first.claimed + second.claimed).toBe(1);
    expect(published.map((e) => e.id)).toEqual([stale.id]);
    expect(published[0].timestamp.getTime()).toBe(now.getTime() - 5 * 60_000);

    const rows = await prisma.outboxEvent.findMany({ where: { event: EVENT }, orderBy: { occurredAt: 'asc' } });
    expect(rows[0]).toMatchObject({ id: stale.id, attempts: 1, leaseExpiresAt: null });
    expect(rows[0].publishedAt).toBeInstanceOf(Date);
    // The fresh row is still the request path's to publish.
    expect(rows[1]).toMatchObject({ id: fresh.id, publishedAt: null, attempts: 0 });

    expect(await relay.relay(now)).toEqual({ claimed: 0, published: 0, failed: 0 });
  });

  it('purges published rows past retention and keeps the rest', async () => {
    if (!usable) return;
    await prisma.outboxEvent.deleteMany({ where: { event: EVENT } });
    const now = new Date();
    const old = new DomainEvent(EVENT, '1', { n: 5 });
    const recent = new DomainEvent(EVENT, '1', { n: 6 });
    const unpublished = new DomainEvent(EVENT, '1', { n: 7 });
    const longAgo = new Date(now.getTime() - (OUTBOX_RETENTION_DAYS + 1) * DAY_MS);
    await prisma.outboxEvent.createMany({
      data: [
        { ...toOutboxRow(old), publishedAt: longAgo } as never,
        { ...toOutboxRow(recent), publishedAt: now } as never,
        { ...toOutboxRow(unpublished), occurredAt: now } as never,
      ],
    });

    const purged = await new OutboxRelay(prisma as never, events).purge(now);

    expect(purged).toBeGreaterThanOrEqual(1);
    const left = (await prisma.outboxEvent.findMany({ where: { event: EVENT } })).map((row) => row.id).sort();
    expect(left).toEqual([recent.id, unpublished.id].sort());
  });
});

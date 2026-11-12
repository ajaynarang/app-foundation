import { PrismaClient, type Deadline } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { DeadlineService } from '@appshore/platform/infrastructure/deadlines/deadline.service';
import { DeadlineSweeper } from '@appshore/platform/infrastructure/deadlines/deadline.sweeper';
import { DeadlineHandlerRegistry } from '@appshore/platform/infrastructure/deadlines/deadline-handler.registry';
import {
  DEADLINE_SUPERSEDED_REASON,
  type DeadlineHandler,
  type DeadlineOutcome,
} from '@appshore/platform/infrastructure/deadlines/deadline.types';

/**
 * Deadlines end to end on a real Postgres (ADR "Outbox and deadlines"). The template ships no production kind, so
 * this spec registers a test kind the way an app module would and proves the mechanism: a timer exists only if its
 * transaction committed; scheduling a key again supersedes the pending row (and the partial unique index refuses a
 * second pending row); the sweeper fires a due row once, even with two sweepers at once; a cancelled row never fires;
 * a failing handler leaves the row pending with a backoff, never given up.
 *
 * Skipped when DATABASE_URL is unset or names no usable database. It writes only under its own tenant, which it
 * deletes at the end (the rows go with it, ON DELETE CASCADE).
 */
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

const TENANT_SLUG = 'deadlines-integration-probe';
const KIND = 'TEST_PROBE';
const MINUTE = 60_000;

/** The test kind's handler: records each run and answers what the test sets. */
class ProbeHandler implements DeadlineHandler {
  readonly kind = KIND;
  readonly runs: string[] = [];
  next: () => Promise<DeadlineOutcome> = async () => ({ outcome: 'fired' });

  async fire(deadline: Deadline): Promise<DeadlineOutcome> {
    this.runs.push(deadline.id);
    return this.next();
  }
}

describe('deadlines on a real database', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;
  let tenantId: number;
  let service: DeadlineService;
  let sweeper: DeadlineSweeper;
  let handler: ProbeHandler;

  const input = (overrides: Partial<Parameters<DeadlineService['schedule']>[1]> = {}) => ({
    tenantId,
    kind: KIND,
    subjectType: 'probe',
    subjectId: 'prb_1',
    dedupeKey: 'probe:prb_1:remind',
    dueAt: new Date(Date.now() - MINUTE),
    ...overrides,
  });

  const rowsOfTenant = () => prisma.deadline.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('deadlines.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.tenant.deleteMany({ where: { tenantId: TENANT_SLUG } });
      const tenant = await prisma.tenant.create({ data: { tenantId: TENANT_SLUG, companyName: 'Deadlines probe' } });
      tenantId = tenant.id;
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`deadlines.integration: no usable database (${(err as Error).message}) — skipping`);
    }
  }, 30_000);

  afterAll(async () => {
    if (usable) await prisma.tenant.deleteMany({ where: { tenantId: TENANT_SLUG } });
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  beforeEach(async () => {
    if (!usable) return;
    await prisma.deadline.deleteMany({ where: { tenantId } });
    service = new DeadlineService(prisma as never);
    const registry = new DeadlineHandlerRegistry();
    handler = new ProbeHandler();
    registry.register(handler);
    sweeper = new DeadlineSweeper(prisma as never, registry);
  });

  /** Sweep, then report only this tenant's rows (the sweeper claims every due row in the database). */
  async function sweep() {
    await sweeper.sweep();
    return rowsOfTenant();
  }

  it('a committed transaction leaves a pending timer; a rolled-back one leaves none', async () => {
    if (!usable) return;

    await prisma.$transaction((tx) => service.schedule(tx as never, input({ dedupeKey: 'committed' })));
    await expect(
      prisma.$transaction(async (tx) => {
        await service.schedule(tx, input({ dedupeKey: 'rolled-back' }));
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');

    const rows = await rowsOfTenant();
    expect(rows.map((row) => row.dedupeKey)).toEqual(['committed']);
    expect(rows[0]).toMatchObject({ firedAt: null, cancelledAt: null, attempts: 0 });
  });

  it('scheduling a key again supersedes the pending row, and only the new one fires', async () => {
    if (!usable) return;
    const later = new Date(Date.now() + 60 * MINUTE);

    const first = await prisma.$transaction((tx) => service.schedule(tx as never, input({ dueAt: later })));
    const second = await prisma.$transaction((tx) => service.schedule(tx as never, input()));

    const rows = await sweep();
    expect(rows.find((row) => row.id === first.id)).toMatchObject({
      cancelReason: DEADLINE_SUPERSEDED_REASON,
      firedAt: null,
    });
    expect(rows.find((row) => row.id === first.id)?.cancelledAt).toBeInstanceOf(Date);
    expect(rows.find((row) => row.id === second.id)?.firedAt).toBeInstanceOf(Date);
    expect(handler.runs).toEqual([second.id]);
  });

  it('the partial unique index refuses a second pending row for one key', async () => {
    if (!usable) return;
    await prisma.$transaction((tx) => service.schedule(tx as never, input()));

    // A writer that skips the supersede step (or races it) is refused by the database itself.
    await expect(
      prisma.deadline.create({
        data: {
          id: '01900000-0000-7000-8000-000000000001',
          tenantId,
          kind: KIND,
          subjectType: 'probe',
          subjectId: 'prb_1',
          dedupeKey: 'probe:prb_1:remind',
          dueAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('fires a due timer exactly once, even with two sweepers at once', async () => {
    if (!usable) return;
    const deadline = await prisma.$transaction((tx) => service.schedule(tx as never, input()));
    const notYet = await prisma.$transaction((tx) =>
      service.schedule(tx as never, input({ dedupeKey: 'later', dueAt: new Date(Date.now() + 60 * MINUTE) })),
    );

    await Promise.all([sweeper.sweep(), sweeper.sweep()]);
    const rows = await sweep();

    expect(handler.runs).toEqual([deadline.id]);
    expect(rows.find((row) => row.id === deadline.id)).toMatchObject({ attempts: 1, lockedUntilAt: null });
    expect(rows.find((row) => row.id === deadline.id)?.firedAt).toBeInstanceOf(Date);
    expect(rows.find((row) => row.id === notYet.id)).toMatchObject({ firedAt: null, attempts: 0 });
  });

  it('a cancelled timer never fires', async () => {
    if (!usable) return;
    const deadline = await prisma.$transaction((tx) => service.schedule(tx as never, input()));

    const count = await prisma.$transaction((tx) =>
      service.cancel(tx as never, { tenantId, subjectType: 'probe', subjectId: 'prb_1' }, 'probe resolved'),
    );
    const rows = await sweep();

    expect(count).toBe(1);
    expect(handler.runs).toEqual([]);
    expect(rows.find((row) => row.id === deadline.id)).toMatchObject({ cancelReason: 'probe resolved', firedAt: null });
  });

  it('a failing handler leaves the timer pending with a backoff; a reschedule moves it and restarts the count', async () => {
    if (!usable) return;
    const deadline = await prisma.$transaction((tx) => service.schedule(tx as never, input()));
    handler.next = async () => {
      throw new Error('downstream unavailable');
    };

    const before = Date.now();
    let [row] = await sweep();
    expect(row).toMatchObject({ id: deadline.id, firedAt: null, cancelledAt: null, attempts: 1 });
    expect(row.lastError).toBe('downstream unavailable');
    expect(row.lockedUntilAt.getTime()).toBeGreaterThanOrEqual(before + 30_000 - 1_000);

    // Inside the backoff it is not claimed again.
    [row] = await sweep();
    expect(handler.runs).toHaveLength(1);

    // Once the backoff lapses it is retried; this time the handler moves the due time.
    await prisma.deadline.update({ where: { id: deadline.id }, data: { lockedUntilAt: new Date(Date.now() - 1) } });
    const movedTo = new Date(Date.now() + 60 * MINUTE);
    handler.next = async () => ({ outcome: 'reschedule', dueAt: movedTo });
    [row] = await sweep();

    expect(handler.runs).toHaveLength(2);
    expect(row).toMatchObject({ firedAt: null, lastError: null, attempts: 0, lockedUntilAt: null });
    expect(row.dueAt.getTime()).toBe(movedTo.getTime());
  });
});

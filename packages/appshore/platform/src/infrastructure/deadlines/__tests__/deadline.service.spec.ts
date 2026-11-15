import { BadRequestException } from '@nestjs/common';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { countInMemory, findManyInMemory } from '../../../test/helpers/prisma-where';
import { DEADLINE_OVERDUE_GRACE_MS, DeadlineService, deadlineState } from '../deadline.service';
import { DEADLINE_SUPERSEDED_REASON } from '../deadline.types';

const TENANT_A = { id: 1, tenantId: 'acme', companyName: 'Acme' };
const TENANT_B = { id: 2, tenantId: 'globex', companyName: 'Globex' };
/** What a list item shows of its tenant: the public slug and the name, never the Int key (the ID boundary). */
const publicTenant = ({ tenantId, companyName }: typeof TENANT_A) => ({ tenantId, companyName });

let seq = 0;
function row(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const tenant = (overrides.tenant as typeof TENANT_A) ?? TENANT_A;
  return {
    id: `01900000-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    tenantId: tenant.id,
    tenant,
    kind: 'APPROVAL_REMIND',
    subjectType: 'order',
    subjectId: `ord_${seq}`,
    dedupeKey: `key-${seq}`,
    dueAt: new Date('2026-10-10T10:00:00.000Z'),
    payload: { cycle: 1 },
    firedAt: null as Date | null,
    cancelledAt: null as Date | null,
    cancelReason: null as string | null,
    attempts: 0,
    lockedUntilAt: null as Date | null,
    lastError: null as string | null,
    createdAt: new Date('2026-10-09T10:00:00.000Z'),
    updatedAt: new Date('2026-10-09T10:00:00.000Z'),
    ...overrides,
  };
}

describe('DeadlineService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: DeadlineService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DeadlineService(prisma);
  });

  describe('schedule', () => {
    it('supersedes the pending row for the key, then inserts the new one on the caller transaction', async () => {
      const tx = createMockPrisma();
      tx.deadline.create.mockImplementation(async ({ data }: { data: unknown }) => data);
      const dueAt = new Date('2026-10-11T00:00:00.000Z');

      const created = await service.schedule(tx, {
        tenantId: 1,
        kind: 'APPROVAL_REMIND',
        subjectType: 'order',
        subjectId: 'ord_1',
        dedupeKey: 'approval:apr_1:remind',
        dueAt,
        payload: { cycle: 1 },
      });

      expect(tx.deadline.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 1, dedupeKey: 'approval:apr_1:remind', firedAt: null, cancelledAt: null },
        data: expect.objectContaining({ cancelReason: DEADLINE_SUPERSEDED_REASON, lockedUntilAt: null }),
      });
      expect(tx.deadline.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.deadline.create.mock.invocationCallOrder[0],
      );
      expect(created).toEqual(
        expect.objectContaining({ tenantId: 1, kind: 'APPROVAL_REMIND', dueAt, payload: { cycle: 1 } }),
      );
      expect((created as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
      expect(prisma.deadline.create).not.toHaveBeenCalled();
    });

    it('defaults the payload to an empty object', async () => {
      const tx = createMockPrisma();
      tx.deadline.create.mockImplementation(async ({ data }: { data: unknown }) => data);

      const created = await service.schedule(tx, {
        tenantId: 1,
        kind: 'K',
        subjectType: 's',
        subjectId: 'x',
        dedupeKey: 'k',
        dueAt: new Date(),
      });

      expect((created as { payload: unknown }).payload).toEqual({});
    });

    it('lets a unique violation from a racing schedule propagate (the database refuses two pending rows)', async () => {
      const tx = createMockPrisma();
      tx.deadline.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(
        service.schedule(tx, {
          tenantId: 1,
          kind: 'K',
          subjectType: 's',
          subjectId: 'x',
          dedupeKey: 'k',
          dueAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('cancel', () => {
    it('cancels the pending row for a key with the reason', async () => {
      const tx = createMockPrisma();
      tx.deadline.updateMany.mockResolvedValue({ count: 1 });

      const count = await service.cancel(tx, { tenantId: 1, dedupeKey: 'k' }, 'approval given');

      expect(count).toBe(1);
      expect(tx.deadline.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 1, dedupeKey: 'k', firedAt: null, cancelledAt: null },
        data: expect.objectContaining({
          cancelReason: 'approval given',
          lockedUntilAt: null,
          cancelledAt: expect.any(Date),
        }),
      });
    });

    it('cancels every pending row on a subject, narrowed to kinds when given', async () => {
      const tx = createMockPrisma();
      tx.deadline.updateMany.mockResolvedValue({ count: 2 });

      await service.cancel(
        tx,
        { tenantId: 1, subjectType: 'order', subjectId: 'ord_1', kinds: ['APPROVAL_REMIND', 'APPROVAL_ESCALATE'] },
        'x'.repeat(300),
      );

      const call = tx.deadline.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({
        tenantId: 1,
        subjectType: 'order',
        subjectId: 'ord_1',
        kind: { in: ['APPROVAL_REMIND', 'APPROVAL_ESCALATE'] },
        firedAt: null,
        cancelledAt: null,
      });
      expect(call.data.cancelReason).toHaveLength(200);
    });

    it('cancels every kind on a subject when no kinds are given', async () => {
      const tx = createMockPrisma();
      tx.deadline.updateMany.mockResolvedValue({ count: 0 });

      await service.cancel(tx, { tenantId: 1, subjectType: 'order', subjectId: 'ord_1' }, 'withdrawn');

      expect(tx.deadline.updateMany.mock.calls[0][0].where).not.toHaveProperty('kind');
    });
  });

  describe('list', () => {
    let rows: ReturnType<typeof row>[];

    beforeEach(() => {
      const t = (iso: string) => new Date(iso);
      rows = [
        row({ dueAt: t('2026-10-10T08:00:00.000Z') }),
        row({ dueAt: t('2026-10-10T09:00:00.000Z') }),
        row({ dueAt: t('2026-10-10T09:00:00.000Z') }), // ties on dueAt
        row({ dueAt: t('2026-10-10T09:00:00.000Z'), lastError: 'boom', attempts: 3 }),
        row({ dueAt: t('2026-10-10T07:00:00.000Z'), firedAt: t('2026-10-10T07:00:10.000Z'), attempts: 1 }),
        row({
          dueAt: t('2026-10-10T11:00:00.000Z'),
          cancelledAt: t('2026-10-10T06:00:00.000Z'),
          cancelReason: 'superseded',
        }),
        row({
          dueAt: t('2026-10-10T12:00:00.000Z'),
          tenant: TENANT_B,
          tenantId: TENANT_B.id,
          kind: 'APPROVAL_EXPIRY',
        }),
      ];
      prisma.deadline.findMany.mockImplementation(async (args: never) => findManyInMemory(rows, args));
      prisma.deadline.count.mockImplementation(async (args: never) => countInMemory(rows, args));
    });

    async function walk(query: Parameters<DeadlineService['list']>[0]) {
      const ids: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await service.list({ ...query, cursor });
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor ?? undefined;
        pages += 1;
      } while (cursor && pages < 20);
      return { ids, pages };
    }

    it('walks every row soonest-first across pages, ties broken by id, nothing skipped or repeated', async () => {
      const { ids, pages } = await walk({ limit: 2 });

      const expected = findManyInMemory(rows, { orderBy: [{ dueAt: 'asc' }, { id: 'asc' }] }).map((r) => r.id);
      expect(ids).toEqual(expected);
      expect(pages).toBe(4);
    });

    it('walks latest-first when sorted by latest', async () => {
      const { ids } = await walk({ limit: 3, sort: 'latest' });

      const expected = findManyInMemory(rows, { orderBy: [{ dueAt: 'desc' }, { id: 'desc' }] }).map((r) => r.id);
      expect(ids).toEqual(expected);
    });

    it('refuses a cursor issued by the other sort', async () => {
      const first = await service.list({ limit: 1, sort: 'soonest' });

      await expect(service.list({ cursor: first.nextCursor!, sort: 'latest' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a malformed cursor before querying', async () => {
      await expect(service.list({ cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.deadline.findMany).not.toHaveBeenCalled();
    });

    it('refuses a cursor whose id carries no sort tag', async () => {
      const untagged = Buffer.from(JSON.stringify(['2026-10-10T08:00:00.000Z', 42])).toString('base64url');

      await expect(service.list({ cursor: untagged })).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([['soonest:abc'], ['soonest:'], ["soonest:0190' OR 1=1"]])(
      'refuses a tagged cursor whose id is not a uuid (%s) before querying',
      async (id) => {
        const tampered = Buffer.from(JSON.stringify(['2026-10-10T08:00:00.000Z', id])).toString('base64url');

        await expect(service.list({ cursor: tampered })).rejects.toThrow('This list position is no longer valid');
        expect(prisma.deadline.findMany).not.toHaveBeenCalled();
      },
    );

    it('filters by state and reports counts that ignore the state filter', async () => {
      const page = await service.list({ states: ['FAILING', 'FIRED'] });

      expect(page.items.map((item) => item.state).sort()).toEqual(['FAILING', 'FIRED']);
      expect(page.counts).toEqual({ PENDING: 4, FAILING: 1, FIRED: 1, CANCELLED: 1 });
      expect(page.total).toBe(2);
    });

    it('filters by kind and tenant slug, and the counts respect them', async () => {
      const page = await service.list({ kind: 'APPROVAL_EXPIRY', tenant: 'globex' });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].tenant).toEqual(publicTenant(TENANT_B));
      expect(page.counts).toEqual({ PENDING: 1, FAILING: 0, FIRED: 0, CANCELLED: 0 });
      expect(page.total).toBe(1);
    });

    it('clamps the page size', async () => {
      const page = await service.list({ limit: 500 });

      expect(prisma.deadline.findMany.mock.calls[0][0].take).toBe(101);
      expect(page.nextCursor).toBeNull();
    });

    it('serializes rows to the list item shape', async () => {
      const page = await service.list({ states: ['CANCELLED'] });

      expect(page.items[0]).toEqual({
        id: rows[5].id,
        tenant: publicTenant(TENANT_A),
        kind: 'APPROVAL_REMIND',
        subjectType: 'order',
        subjectId: rows[5].subjectId,
        dedupeKey: rows[5].dedupeKey,
        state: 'CANCELLED',
        dueAt: '2026-10-10T11:00:00.000Z',
        firedAt: null,
        cancelledAt: '2026-10-10T06:00:00.000Z',
        cancelReason: 'superseded',
        attempts: 0,
        lockedUntilAt: null,
        lastError: null,
        payload: { cycle: 1 },
        createdAt: '2026-10-09T10:00:00.000Z',
        updatedAt: '2026-10-09T10:00:00.000Z',
      });
    });

    it("never shows the tenant's Int key, and asks Postgres only for the public fields", async () => {
      const page = await service.list();

      expect(page.items.every((item) => !('id' in item.tenant))).toBe(true);
      expect(prisma.deadline.findMany.mock.calls[0][0].include).toEqual({
        tenant: { select: { tenantId: true, companyName: true } },
      });
    });

    it('serializes a non-object payload as an empty object and a lease as ISO', async () => {
      rows.splice(0, rows.length, row({ payload: ['x'], lockedUntilAt: new Date('2026-10-10T08:02:00.000Z') }));

      const page = await service.list();

      expect(page.items[0].payload).toEqual({});
      expect(page.items[0].lockedUntilAt).toBe('2026-10-10T08:02:00.000Z');
    });
  });

  describe('health', () => {
    it('counts pending, failing and overdue rows and names the oldest overdue due time', async () => {
      const now = new Date('2026-10-10T12:00:00.000Z');
      const rows = [
        row({ dueAt: new Date(now.getTime() - DEADLINE_OVERDUE_GRACE_MS - 60_000) }), // overdue
        row({ dueAt: new Date(now.getTime() - 60_000) }), // late, inside the grace
        row({ dueAt: new Date('2026-10-09T00:00:00.000Z'), lastError: 'boom' }), // failing + overdue
        row({ dueAt: new Date('2026-10-01T00:00:00.000Z'), firedAt: now }), // fired: not counted
      ];
      prisma.deadline.count.mockImplementation(async (args: never) => countInMemory(rows, args));
      prisma.deadline.findFirst.mockImplementation(async (args: never) => findManyInMemory(rows, args)[0] ?? null);

      const health = await service.health(now);

      expect(health).toEqual({
        pending: 2,
        failing: 1,
        overdue: 2,
        oldestOverdueDueAt: '2026-10-09T00:00:00.000Z',
      });
    });

    it('reports no oldest overdue time when nothing is late', async () => {
      prisma.deadline.count.mockResolvedValue(0);
      prisma.deadline.findFirst.mockResolvedValue(null);

      await expect(service.health()).resolves.toEqual({
        pending: 0,
        failing: 0,
        overdue: 0,
        oldestOverdueDueAt: null,
      });
    });
  });

  describe('kinds', () => {
    it('lists the kinds on record, A to Z and bounded', async () => {
      prisma.deadline.groupBy.mockResolvedValue([{ kind: 'APPROVAL_ESCALATE' }, { kind: 'APPROVAL_REMIND' }]);

      await expect(service.kinds()).resolves.toEqual(['APPROVAL_ESCALATE', 'APPROVAL_REMIND']);
      expect(prisma.deadline.groupBy).toHaveBeenCalledWith({ by: ['kind'], orderBy: { kind: 'asc' }, take: 100 });
    });
  });

  describe('deadlineState', () => {
    it.each([
      [{ firedAt: new Date(), cancelledAt: null, lastError: 'x' }, 'FIRED'],
      [{ firedAt: null, cancelledAt: new Date(), lastError: null }, 'CANCELLED'],
      [{ firedAt: null, cancelledAt: null, lastError: 'boom' }, 'FAILING'],
      [{ firedAt: null, cancelledAt: null, lastError: null }, 'PENDING'],
    ])('derives %o as %s', (stamps, state) => {
      expect(deadlineState(stamps)).toBe(state);
    });
  });
});

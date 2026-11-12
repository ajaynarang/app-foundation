import { AgentActivityService } from '../agent-activity.service';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
import { encodeCursor } from '@appshore/kernel/shared/utils/cursor-pagination';

/** A stored invocation row, the columns that must never reach the wire included. */
const activityRow = (n: number) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  tenantId: 7,
  principalKind: 'api_key',
  principalId: 'apikey:ak1',
  principalLabel: 'BI script',
  toolName: 'query-records',
  scopeRequired: 'documents:read',
  hitlTier: 'none',
  argsDigest: 'd1',
  argsRedacted: {},
  argsRaw: null,
  success: true,
  durationMs: 1,
  error: null,
  outputSummary: null,
  piiReadFlag: false,
  confirmationTokenId: null,
  langfuseTraceId: null,
  requestId: null,
  createdAt: new Date('2026-04-20T11:00:00.000Z'),
});

describe('AgentActivityService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AgentActivityService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AgentActivityService(prisma as never);
    prisma.agentInvocationLog.findMany.mockResolvedValue([]);
    prisma.agentInvocationLog.count.mockResolvedValue(0);
  });

  it('returns rows projected to argsRedacted only (never argsRaw or piiReadFlag)', async () => {
    prisma.agentInvocationLog.findMany.mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000001',
        tenantId: 7,
        principalKind: 'api_key',
        principalId: 'ak1',
        principalLabel: 'BI script',
        toolName: 'query-records',
        scopeRequired: 'documents:read',
        hitlTier: 'none',
        argsDigest: 'd1',
        argsRedacted: { status: 'active' },
        argsRaw: { status: 'active', _userId: 42 }, // should NOT leak
        success: true,
        durationMs: 17,
        error: null,
        outputSummary: 'count: 3',
        piiReadFlag: false,
        confirmationTokenId: null,
        langfuseTraceId: null,
        requestId: 'r1',
        createdAt: new Date('2026-04-20T12:00:00Z'),
      },
    ]);

    const page = await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: null,
      limit: 50,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('argsRaw');
    expect(page.items[0]).not.toHaveProperty('piiReadFlag');
    expect(page.items[0]).not.toHaveProperty('tenantId');
    expect(page.items[0]).not.toHaveProperty('requestId');
    expect(page.items[0].argsRedacted).toEqual({ status: 'active' });
    expect(page.nextCursor).toBeNull();
  });

  it('filter=approvals returns only rows with confirmationTokenId set', async () => {
    await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'approvals',
      cursor: null,
      limit: 50,
    });
    expect(prisma.agentInvocationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          confirmationTokenId: { not: null },
        }),
      }),
    );
  });

  it('filter=tool_calls returns only rows without confirmationTokenId', async () => {
    await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'tool_calls',
      cursor: null,
      limit: 50,
    });
    expect(prisma.agentInvocationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          confirmationTokenId: null,
        }),
      }),
    );
  });

  it('pages by (createdAt, id): the cursor it hands out selects strictly after the last row', async () => {
    const row = { ...activityRow(0), createdAt: new Date('2026-04-20T12:00:00.000Z') };
    prisma.agentInvocationLog.findMany.mockResolvedValue([row, activityRow(1)]);
    const first = await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      limit: 1,
    });

    await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: first.nextCursor,
      limit: 50,
    });
    const args = prisma.agentInvocationLog.findMany.mock.calls[1][0];
    expect(args).toMatchObject({ take: 51, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const [scope, keyset] = args.where.AND;
    expect(scope).toMatchObject({ tenantId: 7, principalId: 'apikey:ak1' });
    // Rows of an earlier millisecond, or of the same millisecond with a smaller id.
    expect(keyset.OR).toEqual([
      { createdAt: { lt: new Date('2026-04-20T12:00:00.000Z') } },
      {
        createdAt: { gte: new Date('2026-04-20T12:00:00.000Z'), lt: new Date('2026-04-20T12:00:00.001Z') },
        id: { lt: row.id },
      },
    ]);
  });

  it('walks every row once when several calls share a millisecond (a createdAt cursor dropped them)', async () => {
    // A tool loop logs several invocations in one millisecond; one row is another principal's.
    const stamps = tiedTimestamps(8, 4);
    const rows = stamps.map((createdAt, index) => ({
      ...activityRow((index * 5) % 8),
      principalId: index === 7 ? 'apikey:other' : 'apikey:ak1',
      createdAt,
    }));
    Object.assign(prisma.agentInvocationLog, fixtureModel(rows));

    const totals: number[] = [];
    const { pages, items } = await walkCursorList(async (cursor) => {
      const page = await service.list({
        tenantId: 7,
        principalKind: 'api_key',
        principalId: 'ak1',
        filter: 'all',
        cursor,
        limit: 3,
      });
      totals.push(page.total);
      return page;
    });

    expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
    expect(new Set(items.map((item) => item.id)).size).toBe(7);
    const times = items.map((item) => Date.parse(item.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(totals).toEqual([7, 7, 7]);
  });

  it('answers 400 on a cursor it did not issue (the old createdAt cursor included), before any query runs', async () => {
    for (const cursor of ['2026-04-20T12:00:00.000Z', 'nope']) {
      await expect(
        service.list({ tenantId: 7, principalKind: 'api_key', principalId: 'ak1', filter: 'all', cursor }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(prisma.agentInvocationLog.findMany).not.toHaveBeenCalled();
  });

  it('clamps limit to [1, 100]', async () => {
    await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: null,
      limit: 1000,
    });
    expect(prisma.agentInvocationLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));

    await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: null,
      limit: 0,
    });
    expect(prisma.agentInvocationLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 2 }));
  });

  it('scopes strictly by tenantId + principalKind + principalId (canonical form)', async () => {
    await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: null,
      limit: 50,
    });
    // Service normalizes the bare principalId to the audit-log canonical
    // form (`apikey:ak1`) so the UI can pass either the prefixed or bare value.
    expect(prisma.agentInvocationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 7,
          principalKind: 'api_key',
          principalId: 'apikey:ak1',
        }),
      }),
    );
  });

  it('sets nextCursor when the page is full', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      principalLabel: 'BI script',
      toolName: 'query-records',
      scopeRequired: 'documents:read',
      hitlTier: 'none',
      argsDigest: 'd1',
      argsRedacted: {},
      argsRaw: null,
      success: true,
      durationMs: 1,
      error: null,
      outputSummary: null,
      piiReadFlag: false,
      confirmationTokenId: null,
      langfuseTraceId: null,
      requestId: null,
      createdAt: new Date(`2026-04-20T12:00:${i.toString().padStart(2, '0')}Z`),
    }));
    prisma.agentInvocationLog.findMany.mockResolvedValue(rows);

    const page = await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: null,
      limit: 2, // will receive 3 rows (take: limit+1), last one trims + sets nextCursor
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(encodeCursor(rows[1].createdAt, rows[1].id));
  });
});

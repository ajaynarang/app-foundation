import { AgentActivityService } from '../agent-activity.service';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';

describe('AgentActivityService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AgentActivityService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AgentActivityService(prisma as never);
    prisma.agentInvocationLog.findMany.mockResolvedValue([]);
  });

  it('returns rows projected to argsRedacted only (never argsRaw or piiReadFlag)', async () => {
    prisma.agentInvocationLog.findMany.mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000001',
        tenantId: 7,
        principalKind: 'api_key',
        principalId: 'ak1',
        principalLabel: 'BI script',
        toolName: 'query-loads',
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

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).not.toHaveProperty('argsRaw');
    expect(page.rows[0]).not.toHaveProperty('piiReadFlag');
    expect(page.rows[0]).not.toHaveProperty('tenantId');
    expect(page.rows[0]).not.toHaveProperty('requestId');
    expect(page.rows[0].argsRedacted).toEqual({ status: 'active' });
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

  it('applies cursor pagination using createdAt', async () => {
    await service.list({
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: '2026-04-20T12:00:00.000Z',
      limit: 50,
    });
    expect(prisma.agentInvocationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: new Date('2026-04-20T12:00:00.000Z') },
        }),
        take: 51,
        orderBy: { createdAt: 'desc' },
      }),
    );
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
      toolName: 'query-loads',
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
    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).toBe(rows[1].createdAt.toISOString());
  });
});

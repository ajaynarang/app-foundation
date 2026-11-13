import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { ModuleRef } from '@nestjs/core';
import { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { ScopeRegistryService } from '../scope-registry.service';
import { HitlPolicyService } from '../hitl-policy.service';
import { ToolExecutorService } from '../tool-executor.service';
import { AgentInvocationLoggerService } from '../agent-invocation-logger.service';
import { InvocationPipelineService } from '../invocation-pipeline.service';
import { ToolAccessPolicyService } from '../tool-access-policy.service';
import { fromUser } from '@appshore/platform/auth/agent-principal';
import { RequiresScope } from '../requires-scope.decorator';
import type { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';

/**
 * Phase A end-to-end smoke: real pipeline + real PrismaClient writing a row
 * into agent_invocation_logs, with mocked registry/moduleRef. The
 * pipeline is always on. Skipped when DATABASE_URL is unset or names no usable
 * database: Postgres is unreachable, refuses the login, has no such database, is
 * not migrated, or holds no seeded workspace member. Any other failure in setup fails the spec.
 * The rows a run writes (its agent_invocation_logs row and the outbox_events row of
 * app.agent.invocation-completed) are deleted in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

/** The tool this spec registers; no real tool has this name, so cleanup can key on it. */
const TOOL_NAME = 'query-records';

/** Error codes that mean "no usable database here", as opposed to a defect. */
const NO_DATABASE_CODES = new Set([
  'ECONNREFUSED', // nothing listens on the port
  'ENOTFOUND', // host does not resolve
  'ETIMEDOUT',
  'P1000', // login refused
  'P1001', // server unreachable
  'P1003', // database does not exist
  'P1010', // access denied
  'P2021', // table missing: not migrated
]);

function isNoDatabase(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code !== undefined && NO_DATABASE_CODES.has(code);
}

class TestRecordsReadTool {
  @RequiresScope('platform:read')
  async queryRecords(_args: Record<string, unknown>) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ count: 0 }) }],
    };
  }
}

describe('Phase A pipeline integration', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let pipeline: InvocationPipelineService;
  let dbReachable = false;
  let testTenantId: number;
  let testUserId: number;
  const suiteStart = new Date();

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('pipeline.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });
      // The pipeline refuses a person with no membership in the workspace, so act as a real member.
      const member = await prisma.workspaceMember.findFirst({
        orderBy: { id: 'asc' },
        select: { userId: true, tenantId: true },
      });
      if (!member) {
        console.warn('pipeline.integration: no seeded workspace member — skipping');
        return;
      }
      testTenantId = member.tenantId;
      testUserId = member.userId;
      dbReachable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`pipeline.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }

    const toolInstance = new TestRecordsReadTool();

    const registry = {
      getMcpModuleIds: () => ['m1'],
      getTools: () => [
        {
          metadata: { name: TOOL_NAME, description: 'q', parameters: null },
          providerClass: TestRecordsReadTool,
          methodName: 'queryRecords',
        },
      ],
    } as unknown as McpRegistryDiscoveryService;

    const moduleRef = {
      get: (token: unknown) => (token === TestRecordsReadTool ? toolInstance : null),
    } as unknown as ModuleRef;

    // The real outbox on the real database; publishing is a no-op, so the staged rows are simply marked published.
    const events = {
      publish: async () => undefined,
    } as unknown as DomainEventService;
    const outbox = new OutboxService(prisma as any, events);

    const scopeRegistry = new ScopeRegistryService(registry);
    await scopeRegistry.onApplicationBootstrap();

    const hitl = new HitlPolicyService();
    const executor = new ToolExecutorService(scopeRegistry, moduleRef, prisma as any);
    const logger = new AgentInvocationLoggerService(prisma as any, outbox);
    const challenges = {
      issue: async () => ({
        challengeId: 'test-challenge',
        expiresAt: new Date(),
      }),
      consume: async () => ({ ok: true }),
      verifyPin: async () => ({ ok: true }),
    } as any;
    // The read tool declares no plan feature, so the guard is never consulted; the membership read is real.
    const policy = new ToolAccessPolicyService(scopeRegistry, prisma as any, { canActivate: async () => true } as any);
    pipeline = new InvocationPipelineService(scopeRegistry, hitl, executor, logger, challenges, policy);
  }, 30_000);

  afterAll(async () => {
    if (dbReachable) {
      const rows = await prisma.agentInvocationLog.findMany({
        where: { tenantId: testTenantId, toolName: TOOL_NAME, createdAt: { gte: suiteStart } },
        select: { id: true },
      });
      for (const { id } of rows) {
        await prisma.outboxEvent.deleteMany({
          where: { event: DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED, data: { path: ['rowId'], equals: id } },
        });
      }
      await prisma.agentInvocationLog.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    }
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  it('writes an AgentInvocationLog row on a successful read-tool invocation', async () => {
    if (!dbReachable) {
      console.warn('pipeline.integration: skipped — no usable database');
      return;
    }

    const before = new Date();
    const principal = fromUser({
      userId: testUserId,
      tenantId: testTenantId,
      role: 'MEMBER',
      scopes: ['platform:read'],
    });
    const result = await pipeline.run(principal, TOOL_NAME, {});
    expect(result.isError).toBeFalsy();

    const row = await prisma.agentInvocationLog.findFirst({
      where: {
        tenantId: testTenantId,
        toolName: TOOL_NAME,
        principalKind: 'user',
        createdAt: { gte: before },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    expect(row?.success).toBe(true);
    expect(row?.scopeRequired).toBe('platform:read');
    expect(row?.hitlTier).toBe('none');
    expect(row?.durationMs).toBeGreaterThanOrEqual(0);
    expect(row?.argsRaw).toBeNull();
  }, 30_000);
});

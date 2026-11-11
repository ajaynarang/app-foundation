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
import { fromUser } from '@appshore/platform/auth/agent-principal';
import { RequiresScope } from '../requires-scope.decorator';
import type { AiPrismaService } from '../../rls/ai-prisma.service';
import type { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';

/**
 * Phase A end-to-end smoke: real pipeline + real PrismaClient writing a row
 * into agent_invocation_logs, with mocked registry/moduleRef/aiPrisma. The
 * pipeline is always on. Skipped only when there is no usable database: Postgres
 * is unreachable, refuses the login, has no such database, is not migrated, or
 * holds no seeded tenant. Any other failure in setup fails the spec.
 */
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5499/app?schema=public';

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

  beforeAll(async () => {
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });
      const anyTenant = await prisma.tenant.findFirst({
        orderBy: { id: 'asc' },
      });
      if (!anyTenant) {
        console.warn('pipeline.integration: no seeded tenant — skipping');
        return;
      }
      testTenantId = anyTenant.id;
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
          metadata: { name: 'query-records', description: 'q', parameters: null },
          providerClass: TestRecordsReadTool,
          methodName: 'queryRecords',
        },
      ],
    } as unknown as McpRegistryDiscoveryService;

    const moduleRef = {
      get: (token: unknown) => (token === TestRecordsReadTool ? toolInstance : null),
    } as unknown as ModuleRef;

    const aiPrisma = {
      executeWithRlsContext: (_t: number, _u: number, _r: string, fn: () => Promise<unknown>) => fn(),
    } as unknown as AiPrismaService;

    const events = {
      emit: async () => undefined,
    } as unknown as DomainEventService;

    const scopeRegistry = new ScopeRegistryService(registry);
    await scopeRegistry.onApplicationBootstrap();

    const hitl = new HitlPolicyService();
    const executor = new ToolExecutorService(scopeRegistry, aiPrisma, moduleRef, prisma as any);
    const logger = new AgentInvocationLoggerService(prisma as any, events);
    const challenges = {
      issue: async () => ({
        challengeId: 'test-challenge',
        expiresAt: new Date(),
      }),
      consume: async () => ({ ok: true }),
      verifyPin: async () => ({ ok: true }),
    } as any;
    pipeline = new InvocationPipelineService(scopeRegistry, hitl, executor, logger, challenges);
  }, 30_000);

  afterAll(async () => {
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
      userId: 1,
      tenantId: testTenantId,
      role: 'MEMBER',
      scopes: ['platform:read'],
    });
    const result = await pipeline.run(principal, 'query-records', {});
    expect(result.isError).toBeFalsy();

    const row = await prisma.agentInvocationLog.findFirst({
      where: {
        tenantId: testTenantId,
        toolName: 'query-records',
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

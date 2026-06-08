import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { ModuleRef } from '@nestjs/core';
import { McpRegistryService } from '@rekog/mcp-nest';
import { ScopeRegistryService } from '../scope-registry.service';
import { HitlPolicyService } from '../hitl-policy.service';
import { ToolExecutorService } from '../tool-executor.service';
import { AgentInvocationLoggerService } from '../agent-invocation-logger.service';
import { InvocationPipelineService } from '../invocation-pipeline.service';
import { fromUser } from '../agent-principal';
import { RequiresScope } from '../requires-scope.decorator';
import type { AiPrismaService } from '../../rls/ai-prisma.service';
import type { DomainEventService } from '../../../../infrastructure/events/domain-event.service';

/**
 * Phase A end-to-end smoke: real pipeline + real PrismaClient writing a row
 * into agent_invocation_logs, with mocked registry/moduleRef/aiPrisma. The
 * pipeline is always on. Skipped when local Postgres is unreachable or no
 * tenant is seeded.
 */
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sally_user:sally_password@localhost:5432/sally';

class TestFleetReadTool {
  @RequiresScope('fleet:read')
  async queryLoads(_args: Record<string, unknown>) {
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
      prisma = new PrismaClient({ adapter } as any);
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
      console.warn(`pipeline.integration: DB unreachable (${(err as Error).message}) — skipping`);
      return;
    }

    const toolInstance = new TestFleetReadTool();

    const registry = {
      getMcpModuleIds: () => ['m1'],
      getTools: () => [
        {
          metadata: { name: 'query-loads', description: 'q', parameters: null },
          providerClass: TestFleetReadTool,
          methodName: 'queryLoads',
        },
      ],
    } as unknown as McpRegistryService;

    const moduleRef = {
      get: (token: unknown) => (token === TestFleetReadTool ? toolInstance : null),
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
      console.warn('pipeline.integration: skipped — DB unreachable');
      return;
    }

    const before = new Date();
    const principal = fromUser({
      userId: 1,
      tenantId: testTenantId,
      role: 'DISPATCHER',
      scopes: ['fleet:read'],
    });
    const result = await pipeline.run(principal, 'query-loads', {});
    expect(result.isError).toBeFalsy();

    const row = await prisma.agentInvocationLog.findFirst({
      where: {
        tenantId: testTenantId,
        toolName: 'query-loads',
        principalKind: 'user',
        createdAt: { gte: before },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    expect(row?.success).toBe(true);
    expect(row?.scopeRequired).toBe('fleet:read');
    expect(row?.hitlTier).toBe('none');
    expect(row?.durationMs).toBeGreaterThanOrEqual(0);
    expect(row?.argsRaw).toBeNull();
  }, 30_000);
});

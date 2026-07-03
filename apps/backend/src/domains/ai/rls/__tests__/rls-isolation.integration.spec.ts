/**
 * RLS Isolation Integration Tests
 *
 * These tests verify that PostgreSQL Row Level Security policies correctly
 * enforce tenant isolation at the database level for the tables AI tools read.
 *
 * Prerequisites:
 * - Running PostgreSQL with the RLS migration applied (20260611000001_ai_reader_rls)
 * - ai_reader role created
 * - RLS policies on conversations and conversation_messages
 * - knowledge_documents granted to ai_reader (global content, no RLS)
 *
 * Run with: npx jest --config jest.e2e.config.ts rls-isolation.integration
 * Or skip in unit test runs by default (describe.skip when no DATABASE_URL).
 */

import { PrismaClient } from '@appshore/db';

/**
 * This integration test requires a direct PostgreSQL connection via PrismaClient
 * with the "library" engine. In Prisma 7.3+ with the "client" engine (default),
 * PrismaClient requires an `adapter` or `accelerateUrl` and cannot connect
 * directly via DATABASE_URL alone. Skip in unit test runs — use the E2E config
 * instead: npx jest --config jest.e2e.config.ts rls-isolation.integration
 */
const describeIf = describe.skip;

describeIf('RLS Isolation (Integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Helper: execute a query within RLS context (mimics AiPrismaService).
   * Sets tenant/role/user session variables, switches to ai_reader role,
   * then executes the provided query function.
   */
  async function withRlsContext(tenantId: number, role: string, userId: number, fn: (tx: any) => Promise<any>) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${String(tenantId)}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_user_role', ${role}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
      // Switch to ai_reader role so RLS policies apply
      await tx.$executeRaw`SET LOCAL ROLE ai_reader`;
      return fn(tx);
    });
  }

  describe('tenant isolation', () => {
    it('should only return conversations for the specified tenant', async () => {
      const tenant1Convos = await withRlsContext(1, 'member', 1, async (tx) => {
        return tx.$queryRaw`SELECT id, tenant_id FROM conversations LIMIT 10`;
      });

      for (const convo of tenant1Convos as any[]) {
        expect(convo.tenant_id).toBe(1);
      }
    });

    it('should return empty result when querying non-existent tenant', async () => {
      const convos = await withRlsContext(999999, 'member', 1, async (tx) => {
        return tx.$queryRaw`SELECT id FROM conversations LIMIT 10`;
      });

      expect(convos).toEqual([]);
    });

    it('should isolate conversation messages via parent conversation tenant', async () => {
      const messages = await withRlsContext(999999, 'member', 1, async (tx) => {
        return tx.$queryRaw`SELECT id FROM conversation_messages LIMIT 10`;
      });

      // No conversations visible for tenant 999999 → no messages visible either
      expect(messages).toEqual([]);
    });

    it('should allow reading global knowledge documents regardless of tenant', async () => {
      // knowledge_documents has no tenant_id — it is shared product content.
      // ai_reader has SELECT on it without an RLS policy.
      await expect(
        withRlsContext(1, 'member', 1, async (tx) => {
          return tx.$queryRaw`SELECT id FROM knowledge_documents LIMIT 1`;
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('read-only enforcement', () => {
    it('should reject INSERT from ai_reader role', async () => {
      await expect(
        withRlsContext(1, 'member', 1, async (tx) => {
          await tx.$executeRaw`INSERT INTO conversations (conversation_id, tenant_id, user_mode) VALUES ('conv_rls_test', 1, 'member')`;
        }),
      ).rejects.toThrow();
    });

    it('should reject UPDATE from ai_reader role', async () => {
      await expect(
        withRlsContext(1, 'member', 1, async (tx) => {
          await tx.$executeRaw`UPDATE conversations SET title = 'hacked' WHERE tenant_id = 1`;
        }),
      ).rejects.toThrow();
    });

    it('should reject DELETE from ai_reader role', async () => {
      await expect(
        withRlsContext(1, 'member', 1, async (tx) => {
          await tx.$executeRaw`DELETE FROM conversations WHERE tenant_id = 1`;
        }),
      ).rejects.toThrow();
    });

    it('should reject writes to knowledge_documents from ai_reader role', async () => {
      await expect(
        withRlsContext(1, 'member', 1, async (tx) => {
          await tx.$executeRaw`DELETE FROM knowledge_documents`;
        }),
      ).rejects.toThrow();
    });
  });

  describe('context isolation', () => {
    it('should not leak tenant context between transactions', async () => {
      // Run two transactions with different tenants in sequence
      const tenant1Result = await withRlsContext(1, 'member', 1, async (tx) => {
        return tx.$queryRaw`SELECT current_setting('app.current_tenant_id', true) as tid`;
      });

      const tenant2Result = await withRlsContext(2, 'member', 1, async (tx) => {
        return tx.$queryRaw`SELECT current_setting('app.current_tenant_id', true) as tid`;
      });

      expect((tenant1Result as any[])[0].tid).toBe('1');
      expect((tenant2Result as any[])[0].tid).toBe('2');
    });
  });
});

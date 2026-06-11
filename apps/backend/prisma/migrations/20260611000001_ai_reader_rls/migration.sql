-- AI reader role + Row Level Security
--
-- AiPrismaService.executeWithRlsContext (src/domains/ai/rls/ai-prisma.service.ts)
-- wraps every MCP tool invocation in `SET LOCAL ROLE ai_reader` after setting
-- the session variables app.current_tenant_id / app.current_user_role /
-- app.current_user_id. This migration creates that role and the policies it
-- relies on. Without it, every AI tool call fails with
-- `role "ai_reader" does not exist`.
--
-- Scope: the tables the starter's AI tools read —
--   - knowledge_documents     (search-kb / get-product-info; global, no tenant_id)
--   - conversations           (tenant-scoped chat history)
--   - conversation_messages   (scoped via parent conversation)
-- When you add MCP tools that read your own domain tables, extend this
-- pattern: GRANT SELECT + ENABLE ROW LEVEL SECURITY + a tenant_isolation
-- policy keyed on current_setting('app.current_tenant_id').

-- 1. Create the read-only AI role (idempotent — roles are cluster-wide)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_reader') THEN
    CREATE ROLE ai_reader NOLOGIN;
  END IF;
END
$$;

-- 2. Read-only grants on the tables AI tools query.
-- The explicit schema USAGE grant matters: fresh databases give PUBLIC usage
-- on schema public by default, but recreated schemas (DROP SCHEMA public
-- CASCADE) and hardened setups (RDS) do not.
GRANT USAGE ON SCHEMA public TO ai_reader;
GRANT SELECT ON knowledge_documents, conversations, conversation_messages TO ai_reader;

-- Allow the Prisma connection user to switch to ai_reader via SET LOCAL ROLE.
-- current_user is the role running this migration (the Prisma DB user).
GRANT ai_reader TO current_user;

-- 3. Enable RLS on the tenant-scoped tables.
-- knowledge_documents is intentionally NOT RLS-enabled: it is global product
-- content with no tenant_id column, shared by all tenants.
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- 4. Tenant isolation policies (only apply to non-table-owner roles like
-- ai_reader — the default Prisma connection role owns the tables and
-- bypasses RLS automatically).
DROP POLICY IF EXISTS tenant_isolation_conversation ON conversations;
CREATE POLICY tenant_isolation_conversation ON conversations
  FOR SELECT USING (
    tenant_id = current_setting('app.current_tenant_id', true)::int
  );

DROP POLICY IF EXISTS tenant_isolation_message ON conversation_messages;
CREATE POLICY tenant_isolation_message ON conversation_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::int
    )
  );

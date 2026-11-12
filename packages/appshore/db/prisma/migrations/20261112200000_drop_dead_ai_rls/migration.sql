-- Remove the dead AI row-level security policies.
--
-- 20260611000001_ai_reader_rls enabled RLS on conversations and conversation_messages and added
-- SELECT policies for the `ai_reader` role. They never protected anything: the application wrapper
-- opened an `ai_reader` transaction around every tool call, but tools query through the regular
-- (table-owner) connection, which bypasses RLS. That wrapper is deleted in the same change. Tenant
-- isolation is unchanged: it is the tools' own tenant_id filters.
--
-- The `ai_reader` role is deliberately NOT dropped here. Migrations run before the new tasks
-- start, and tasks still on the old code run `SET LOCAL ROLE ai_reader` on every tool call until
-- they are replaced. A later migration (drop_ai_reader_role) revokes its grants and drops it, once
-- this code is live in every environment (docs/upgrade-notes/ai-platform.md).
--
-- Dropping the policies and disabling RLS is safe for that old code: it only removes
-- restrictions, and those tasks keep switching to the still-existing role. Idempotent; safe on a
-- database that never had the policies. Existing rows are untouched.
--
-- Down path: re-run sections 3 and 4 of 20260611000001_ai_reader_rls (ENABLE ROW LEVEL SECURITY
-- on both tables and CREATE POLICY tenant_isolation_conversation / tenant_isolation_message).

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS tenant_isolation_conversation ON conversations;
DROP POLICY IF EXISTS tenant_isolation_message ON conversation_messages;

-- Disable RLS only where no policy is left, so this never undoes a policy a later RLS migration
-- put on the same table.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['conversations', 'conversation_messages']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END
$$;

COMMIT;

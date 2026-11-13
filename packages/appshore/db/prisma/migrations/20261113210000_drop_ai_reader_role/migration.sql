-- Drop the `ai_reader` role.
--
-- 20260611000001_ai_reader_rls created the role for the AI RLS wrapper, which switched to it with
-- `SET LOCAL ROLE ai_reader` around every tool call. 20261112200000_drop_dead_ai_rls removed the
-- wrapper and the policies but kept the role, because tasks still on the old code switch to it
-- until they are replaced. This migration finishes the job.
--
-- DEPLOY GATE (docs/upgrade-notes/ai-platform.md, "Deploy order for `ai_reader`"): deploy every
-- earlier change in every environment first, so no task on the old code is serving, and only then
-- pull this migration. Run while an old task serves, its next tool call fails with
-- `role "ai_reader" does not exist`.
--
-- 1. Revoke what the old migration granted in this database: SELECT on the three tables, USAGE on
--    the schema, and the migration user's membership in the role. Each step is skipped when the
--    role or the table is not there, so the migration is safe on any database and safe to re-run.
-- 2. Drop the role. Roles are cluster-wide, grants are per database: another database on the same
--    server (a shadow database, a second product) may still hold grants to it, or a product may
--    have added its own. Then DROP ROLE fails with dependent_objects_still_exist. That is caught
--    and reported as a notice, never a failure; the role is dropped by whichever database's run
--    revokes the last grant. A migration user that may not drop the role (insufficient_privilege)
--    gets a notice too: the role is then inert and an operator can drop it by hand.
--
-- No table, column or row changes. Down path: re-run sections 1 and 2 of
-- 20260611000001_ai_reader_rls (CREATE ROLE ai_reader NOLOGIN and its grants); no code uses it.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  tbl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_reader') THEN
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY['knowledge_documents', 'conversations', 'conversation_messages']
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM ai_reader', tbl);
    END IF;
  END LOOP;

  REVOKE ALL ON SCHEMA public FROM ai_reader;

  IF pg_has_role(current_user, 'ai_reader', 'MEMBER') THEN
    EXECUTE 'REVOKE ai_reader FROM ' || quote_ident(current_user);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_reader') THEN
    DROP ROLE ai_reader;
  END IF;
EXCEPTION
  WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'role ai_reader not dropped: it still holds grants elsewhere (%). Its grants in this database are revoked; it is dropped once the last database that grants to it runs this migration.', SQLERRM;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'role ai_reader not dropped: this user may not drop it (%). Its grants in this database are revoked; drop it by hand.', SQLERRM;
END
$$;

COMMIT;

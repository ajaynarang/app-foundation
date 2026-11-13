-- One live account per email. `users` is unique only on (tenant_id, email); this partial unique index on
-- lower(email) over the rows that are not soft-deleted makes the database hold the rule the code assumes.
-- Hand-written: Prisma cannot express an expression or partial index. Name and SQL match
-- packages/appshore/db/src/email-uniqueness.ts.
--
-- Self-skipping, so a deploy never fails on data a product already has. While two live accounts share an email
-- the index is not created: this raises a notice and changes nothing, the backend logs
-- `auth.email_uniqueness_unenforced` at boot, `pnpm accounts:duplicates` lists the accounts to merge
-- (docs/operations.md, "Duplicate accounts") and `pnpm accounts:enforce-unique-email` creates the index afterwards.
-- No existing row is changed.

DO $$
DECLARE
  duplicate_emails integer;
BEGIN
  SELECT count(*) INTO duplicate_emails
  FROM (
    SELECT 1
    FROM "users"
    WHERE "deleted_at" IS NULL AND "email" IS NOT NULL
    GROUP BY lower("email")
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_emails > 0 THEN
    RAISE NOTICE 'users_email_live_key not created: % email(s) are shared by more than one live account. Merge them (pnpm accounts:duplicates), then run pnpm accounts:enforce-unique-email.', duplicate_emails;
    RETURN;
  END IF;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_live_key" ON "users" (lower("email")) WHERE "deleted_at" IS NULL;
  EXCEPTION WHEN unique_violation THEN
    -- A duplicate written between the count and the build. Skip, like above.
    RAISE NOTICE 'users_email_live_key not created: a duplicate live email appeared during the migration. Run pnpm accounts:duplicates, then pnpm accounts:enforce-unique-email.';
  END;
END $$;

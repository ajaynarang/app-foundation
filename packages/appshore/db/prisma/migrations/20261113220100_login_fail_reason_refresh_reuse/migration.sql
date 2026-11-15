-- A retired refresh token presented again. Its own migration: Postgres cannot use a new enum value in the
-- transaction that adds it.

-- AlterEnum
ALTER TYPE "login_fail_reason" ADD VALUE 'REFRESH_REUSE';

-- A public id for the four foundation tables that are listed but had only an Int key. It is the keyset
-- tiebreak of their cursor lists (an Int key never goes in a cursor) and, for broadcasts and feedback, the id
-- in the admin URL.
--
-- Each table takes five guarded steps, so the migration keeps every existing row and is safe to run again:
--   1. add the column nullable, with no default: a catalog change, no table rewrite;
--   2. fill the rows that have none;
--   3. set the default, so old code and raw SQL keep inserting during a rolling deploy;
--   4. set NOT NULL;
--   5. build the unique index.
-- Adding the column with a volatile default in one statement would rewrite the whole table under an
-- exclusive lock. On a large table, steps 2, 4 and 5 are the slow ones: run them by hand first (update in
-- batches, CREATE UNIQUE INDEX CONCURRENTLY) and this migration then finds nothing left to do.

-- announcements
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "public_id" UUID;
UPDATE "announcements" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
ALTER TABLE "announcements" ALTER COLUMN "public_id" SET DEFAULT gen_random_uuid();
ALTER TABLE "announcements" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "announcements_public_id_key" ON "announcements"("public_id");

-- feedback
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "public_id" UUID;
UPDATE "feedback" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
ALTER TABLE "feedback" ALTER COLUMN "public_id" SET DEFAULT gen_random_uuid();
ALTER TABLE "feedback" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_public_id_key" ON "feedback"("public_id");

-- jobs (append-heavy: the writer passes a UUIDv7, so new keys fill the index in order)
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "public_id" UUID;
UPDATE "jobs" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
ALTER TABLE "jobs" ALTER COLUMN "public_id" SET DEFAULT gen_random_uuid();
ALTER TABLE "jobs" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_public_id_key" ON "jobs"("public_id");

-- login_events (append-heavy: the writer passes a UUIDv7, so new keys fill the index in order)
ALTER TABLE "login_events" ADD COLUMN IF NOT EXISTS "public_id" UUID;
UPDATE "login_events" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
ALTER TABLE "login_events" ALTER COLUMN "public_id" SET DEFAULT gen_random_uuid();
ALTER TABLE "login_events" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "login_events_public_id_key" ON "login_events"("public_id");

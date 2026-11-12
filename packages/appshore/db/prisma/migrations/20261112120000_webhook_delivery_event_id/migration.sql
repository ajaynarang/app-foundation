-- Idempotent webhook dispatch (ADR "Outbox and deadlines"): a delivery log names the domain event it carries, so a
-- second dispatch of one event to one subscription is a keyed lookup and a concurrent duplicate is refused.
-- A new nullable column and a new index; no existing row is deleted.

-- AlterTable
ALTER TABLE "webhook_delivery_logs" ADD COLUMN     "event_id" VARCHAR(64);

-- Backfill the rows written by event dispatch (their payload carries `version`; a test delivery's does not).
-- Only the earliest row of each (subscription, event) pair takes the id, so the unique index below always builds.
UPDATE "webhook_delivery_logs" AS l
SET "event_id" = l."payload" ->> 'id'
FROM (
    SELECT DISTINCT ON ("subscription_id", "payload" ->> 'id') "id"
    FROM "webhook_delivery_logs"
    WHERE "payload" ? 'version'
      AND "payload" ->> 'id' IS NOT NULL
      AND length("payload" ->> 'id') <= 64
    ORDER BY "subscription_id", "payload" ->> 'id', "created_at", "id"
) AS first_of_pair
WHERE l."id" = first_of_pair."id";

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_logs_subscription_id_event_id_key" ON "webhook_delivery_logs"("subscription_id", "event_id");

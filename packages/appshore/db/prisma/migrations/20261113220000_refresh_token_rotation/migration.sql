-- Refresh-token rotation with reuse detection.
--
-- Every refresh now issues a successor in the same family (the session). Existing rows keep working: each becomes
-- the first token of its own family, started when the row was created, in the workspace the user is in today.
-- Rollback needs no data step: the old code reads none of these columns, and a retired row is also `is_revoked`.

-- AlterTable: add the columns nullable, backfill, then require the two the code always writes.
ALTER TABLE "refresh_tokens" ADD COLUMN     "family_id" VARCHAR(50),
ADD COLUMN     "family_started_at" TIMESTAMPTZ,
ADD COLUMN     "last_used_at" TIMESTAMPTZ,
ADD COLUMN     "previous_token_id" VARCHAR(50),
ADD COLUMN     "rotated_at" TIMESTAMPTZ,
ADD COLUMN     "tenant_id" INTEGER;

UPDATE "refresh_tokens" AS rt
SET "family_id" = rt."token_id",
    "family_started_at" = rt."created_at",
    "tenant_id" = u."tenant_id"
FROM "users" AS u
WHERE u."id" = rt."user_id";

-- Every row has a user (the foreign key cascades), so the update above covered every row.
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL,
ALTER COLUMN "family_started_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_tenant_id_idx" ON "refresh_tokens"("tenant_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

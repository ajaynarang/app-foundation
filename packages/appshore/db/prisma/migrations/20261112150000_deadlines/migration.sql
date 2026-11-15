-- Deadlines (ADR "Outbox and deadlines"): a timer is a row, written in the same transaction as the change that
-- needs it and fired by the sweeper on bulk-ops. A new table; no existing row is touched.

-- CreateTable
CREATE TABLE "deadlines" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "subject_type" VARCHAR(40) NOT NULL,
    "subject_id" VARCHAR(100) NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "fired_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "cancel_reason" VARCHAR(200),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until_at" TIMESTAMPTZ,
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deadlines_due_at_idx" ON "deadlines"("due_at");

-- CreateIndex
CREATE INDEX "deadlines_tenant_id_subject_type_subject_id_idx" ON "deadlines"("tenant_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "deadlines_kind_idx" ON "deadlines"("kind");

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One pending timer per (tenant, dedupe key): scheduling the same key again cancels the pending row as
-- 'superseded' before inserting, and this index refuses a second pending row if two transactions race.
-- Hand-written: Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "deadlines_tenant_id_dedupe_key_pending_key" ON "deadlines"("tenant_id", "dedupe_key") WHERE "fired_at" IS NULL AND "cancelled_at" IS NULL;

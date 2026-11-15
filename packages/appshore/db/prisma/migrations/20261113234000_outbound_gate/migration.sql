-- Outbound gate (ADR "Outbound gate"). Additive only: one enum, two new tables. No existing row is touched.

-- CreateEnum
CREATE TYPE "OutboundAllowKind" AS ENUM ('EMAIL', 'EMAIL_DOMAIN', 'PHONE', 'HOST');

-- CreateTable
CREATE TABLE "outbound_allow_entries" (
    "id" UUID NOT NULL,
    "kind" "OutboundAllowKind" NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "note" VARCHAR(200),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_allow_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_suppressions" (
    "id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(200),
    "source" VARCHAR(80) NOT NULL,
    "tenant_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbound_allow_entries_created_by_id_idx" ON "outbound_allow_entries"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_allow_entries_kind_value_key" ON "outbound_allow_entries"("kind", "value");

-- CreateIndex
CREATE INDEX "outbound_suppressions_created_at_idx" ON "outbound_suppressions"("created_at");

-- CreateIndex
CREATE INDEX "outbound_suppressions_tenant_id_idx" ON "outbound_suppressions"("tenant_id");

-- AddForeignKey
ALTER TABLE "outbound_allow_entries" ADD CONSTRAINT "outbound_allow_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_suppressions" ADD CONSTRAINT "outbound_suppressions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

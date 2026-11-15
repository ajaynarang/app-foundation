-- Transactional outbox (ADR "Outbox and deadlines"): one row per domain event, committed with its change.
-- A new table; no existing row is touched.

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "tenant_id" VARCHAR(100) NOT NULL,
    "data" JSONB NOT NULL,
    "actor_id" VARCHAR(100),
    "actor_type" VARCHAR(20),
    "actor_label" VARCHAR(255),
    "actor_agent" JSONB,
    "correlation_id" VARCHAR(50),
    "causation_id" VARCHAR(50),
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "published_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_expires_at" TIMESTAMPTZ,
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_published_at_occurred_at_idx" ON "outbox_events"("published_at", "occurred_at");

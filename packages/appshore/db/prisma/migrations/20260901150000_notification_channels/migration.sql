-- Per-channel delivery: the FCM device registry, the delivery ledger, WhatsApp consent.

CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS', 'WHATSAPP');
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');
CREATE TYPE "WhatsAppConsentSource" AS ENUM ('SIGNUP', 'SETTINGS', 'INBOUND_STOP');

CREATE TABLE "notification_devices" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "notification_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_devices_token_key" ON "notification_devices"("token");
CREATE INDEX "notification_devices_user_id_idx" ON "notification_devices"("user_id");
CREATE INDEX "notification_devices_tenant_id_idx" ON "notification_devices"("tenant_id");

CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "provider_message_id" VARCHAR(100),
    "failure_reason" VARCHAR(60),
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "read_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_deliveries_user_id_created_at_idx" ON "notification_deliveries"("user_id", "created_at");
CREATE INDEX "notification_deliveries_tenant_id_created_at_idx" ON "notification_deliveries"("tenant_id", "created_at");
CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries"("created_at");
CREATE UNIQUE INDEX "notification_deliveries_channel_provider_message_id_key" ON "notification_deliveries"("channel", "provider_message_id");
-- A failed or skipped row must say why; a sent one must not carry a reason.
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_reason_matches_status"
  CHECK (
    ("status" IN ('FAILED', 'SKIPPED') AND "failure_reason" IS NOT NULL) OR
    ("status" NOT IN ('FAILED', 'SKIPPED') AND "failure_reason" IS NULL)
  );
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_attempt_count_positive" CHECK ("attempt_count" >= 1);

CREATE TABLE "whatsapp_consents" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "opted_in_at" TIMESTAMPTZ,
    "opted_out_at" TIMESTAMPTZ,
    "source" "WhatsAppConsentSource" NOT NULL,
    "marketing_opted_in_at" TIMESTAMPTZ,
    "marketing_opted_out_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "whatsapp_consents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_consents_user_id_key" ON "whatsapp_consents"("user_id");

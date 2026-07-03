-- DropForeignKey
ALTER TABLE "add_on_requests" DROP CONSTRAINT "add_on_requests_add_on_id_fkey";

-- DropForeignKey
ALTER TABLE "add_on_requests" DROP CONSTRAINT "add_on_requests_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_add_on_events" DROP CONSTRAINT "tenant_add_on_events_add_on_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_add_on_events" DROP CONSTRAINT "tenant_add_on_events_tenant_id_fkey";

-- DropIndex
DROP INDEX "api_keys_key_idx";

-- DropIndex
DROP INDEX "conversation_sessions_token_idx";

-- DropIndex
DROP INDEX "desk_episodes_temporal_workflow_id_idx";

-- DropIndex
DROP INDEX "desk_memories_content_embedding_idx";

-- DropIndex
DROP INDEX "knowledge_documents_content_tsv_idx";

-- DropIndex
DROP INDEX "knowledge_documents_embedding_idx";

-- DropIndex
DROP INDEX "oauth_access_tokens_token_hash_idx";

-- DropIndex
DROP INDEX "oauth_authorization_codes_code_idx";

-- DropIndex
DROP INDEX "oauth_refresh_tokens_token_hash_idx";

-- DropIndex
DROP INDEX "super_admin_preferences_user_id_idx";

-- DropIndex
DROP INDEX "user_invitations_token_idx";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "rate_limit";

-- AlterTable
ALTER TABLE "desk_episodes" RENAME COLUMN "temporal_workflow_id" TO "workflow_id";
ALTER TABLE "desk_episodes" RENAME COLUMN "temporal_run_id" TO "workflow_run_id";

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "plan_configs" RENAME COLUMN "fleet_limit" TO "seat_limit";
ALTER TABLE "plan_configs" RENAME COLUMN "price_per_unit" TO "price_per_unit_cents";

-- AlterTable
ALTER TABLE "user_preferences" ALTER COLUMN "timezone" SET DEFAULT 'UTC';

-- DropTable
DROP TABLE "add_on_requests";

-- DropTable
DROP TABLE "documents";

-- DropTable
DROP TABLE "tenant_add_on_events";

-- DropEnum
DROP TYPE "AddOnRequestStatus";

-- DropEnum
DROP TYPE "DocumentStatus";

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "ai_invocations_user_id_idx" ON "ai_invocations"("user_id");

-- CreateIndex
CREATE INDEX "announcements_created_by_id_idx" ON "announcements"("created_by_id");

-- CreateIndex
CREATE INDEX "desk_approvals_claimed_by_user_id_idx" ON "desk_approvals"("claimed_by_user_id");

-- CreateIndex
CREATE INDEX "desk_approvals_decided_by_user_id_idx" ON "desk_approvals"("decided_by_user_id");

-- CreateIndex
CREATE INDEX "desk_entity_suppressions_source_episode_id_idx" ON "desk_entity_suppressions"("source_episode_id");

-- CreateIndex
CREATE INDEX "desk_episode_steps_agent_id_idx" ON "desk_episode_steps"("agent_id");

-- CreateIndex
CREATE INDEX "desk_episodes_workflow_id_idx" ON "desk_episodes"("workflow_id");

-- CreateIndex
CREATE INDEX "desk_episodes_owner_agent_id_idx" ON "desk_episodes"("owner_agent_id");

-- CreateIndex
CREATE INDEX "desk_memories_source_episode_id_idx" ON "desk_memories"("source_episode_id");

-- CreateIndex
CREATE INDEX "desk_responsibilities_agent_id_idx" ON "desk_responsibilities"("agent_id");

-- CreateIndex
CREATE INDEX "feedback_resolved_by_idx" ON "feedback"("resolved_by");

-- CreateIndex
CREATE INDEX "notifications_invitation_id_idx" ON "notifications"("invitation_id");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_client_id_idx" ON "oauth_access_tokens"("client_id");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_user_id_idx" ON "oauth_authorization_codes"("user_id");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_client_id_idx" ON "oauth_authorization_codes"("client_id");

-- CreateIndex
CREATE INDEX "oauth_clients_created_by_user_id_idx" ON "oauth_clients"("created_by_user_id");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_client_id_idx" ON "oauth_refresh_tokens"("client_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_tenant_id_idx" ON "push_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "support_ticket_messages_author_id_idx" ON "support_ticket_messages"("author_id");

-- CreateIndex
CREATE INDEX "user_invitations_invited_by_idx" ON "user_invitations"("invited_by");

-- CreateIndex
CREATE INDEX "user_invitations_accepted_by_user_id_idx" ON "user_invitations"("accepted_by_user_id");

-- CreateIndex
CREATE INDEX "users_deleted_by_idx" ON "users"("deleted_by");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "wallet_transactions_related_add_on_id_idx" ON "wallet_transactions"("related_add_on_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_memories" ADD CONSTRAINT "desk_memories_source_episode_id_fkey" FOREIGN KEY ("source_episode_id") REFERENCES "desk_episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Partial unique indexes Prisma cannot express ─────────────────────────────
-- Tenant-less users (SUPER_ADMIN) still get global email uniqueness: the
-- composite unique above treats NULL tenant_id rows as always-distinct.
CREATE UNIQUE INDEX "users_email_no_tenant_unique" ON "users"("email") WHERE "tenant_id" IS NULL AND "email" IS NOT NULL;

-- At most one live billing subscription per tenant.
CREATE UNIQUE INDEX "billing_subscriptions_one_live_per_tenant" ON "billing_subscriptions"("tenant_id") WHERE "status" IN ('ACTIVE', 'TRIALING', 'PAST_DUE');

-- At most one default payment method per billing customer.
CREATE UNIQUE INDEX "payment_methods_one_default_per_customer" ON "payment_methods"("billing_customer_id") WHERE "is_default";

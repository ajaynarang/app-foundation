-- Enable pgvector extension (required for vector columns below)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('TRIAL', 'TRIAL_EXPIRED', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvitationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BillingProviderType" AS ENUM ('STRIPE');

-- CreateEnum
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED', 'TRIALING');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD', 'US_BANK_ACCOUNT');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('TOP_UP', 'OVERAGE_DEDUCTION', 'ADMIN_CREDIT', 'REFUND', 'AUTO_RELOAD');

-- CreateEnum
CREATE TYPE "LoginEventStatus" AS ENUM ('SUCCESS', 'FAILED', 'LOGOUT');

-- CreateEnum
CREATE TYPE "login_fail_reason" AS ENUM ('ACCOUNT_DISABLED', 'TENANT_INACTIVE', 'INVALID_TOKEN', 'USER_NOT_FOUND', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_UPLOAD', 'CONFIRMED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('ACCOUNTING');

-- CreateEnum
CREATE TYPE "IntegrationVendor" AS ENUM ('QUICKBOOKS');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED', 'NEEDS_RECONNECT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('USER_INVITATION', 'TENANT_REGISTRATION_CONFIRMATION', 'TENANT_APPROVED', 'TENANT_REJECTED', 'INTEGRATION_SYNC_COMPLETED', 'INTEGRATION_SYNC_FAILED', 'SETTINGS_UPDATED', 'USER_JOINED', 'ROLE_CHANGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SYSTEM', 'TEAM', 'BILLING');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenantAddOnStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AddOnRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TrustLevel" AS ENUM ('SUPERVISED', 'ASSISTED', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "Lifecycle" AS ENUM ('AVAILABLE', 'COMING_SOON');

-- CreateEnum
CREATE TYPE "TriggerKind" AS ENUM ('SCHEDULED', 'DOMAIN_EVENT', 'WEBHOOK', 'MANUAL');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeskEpisodeStatus" AS ENUM ('RUNNING', 'WAITING_APPROVAL', 'RESOLVED', 'ESCALATED', 'FAILED', 'REJECTED_BY_OPERATOR', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeskEpisodeStepKind" AS ENUM ('HYDRATE', 'PERCEIVE', 'DECIDE', 'DRAFT', 'GATE', 'EXECUTE', 'CLOSE');

-- CreateEnum
CREATE TYPE "DeskEpisodeStepStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'GATED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('ENTITY', 'PATTERN', 'PLAYBOOK');

-- CreateEnum
CREATE TYPE "MemoryPolarity" AS ENUM ('REINFORCE', 'CORRECT');

-- CreateEnum
CREATE TYPE "AiSurface" AS ENUM ('CHAT', 'DESK_STEP', 'MEMORY_EXTRACT', 'EMBEDDING', 'KB_INGEST');

-- CreateEnum
CREATE TYPE "AiInvocationStatus" AS ENUM ('OK', 'ERROR', 'TIMEOUT', 'RATE_LIMITED', 'BUDGET_BLOCKED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(50) NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "subdomain" VARCHAR(100),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "status" "TenantStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approved_at" TIMESTAMPTZ,
    "approved_by" VARCHAR(100),
    "rejected_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "suspended_at" TIMESTAMPTZ,
    "suspended_by" VARCHAR(100),
    "suspension_reason" TEXT,
    "reactivated_at" TIMESTAMPTZ,
    "reactivated_by" VARCHAR(100),
    "onboarding_completed_at" TIMESTAMPTZ,
    "onboarding_progress" JSONB,
    "timezone" VARCHAR(60) DEFAULT 'UTC',
    "desk_schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_zero_retention" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "plan" "TenantPlan" NOT NULL DEFAULT 'TRIAL',
    "trial_started_at" TIMESTAMPTZ,
    "trial_ends_at" TIMESTAMPTZ,
    "plan_assigned_at" TIMESTAMPTZ,
    "plan_assigned_by" VARCHAR(100),
    "jobs_paused" BOOLEAN NOT NULL DEFAULT false,
    "jobs_paused_at" TIMESTAMPTZ,
    "jobs_paused_by" INTEGER,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "tenant_id" INTEGER,
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL,
    "firebase_uid" VARCHAR(128),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone" VARCHAR(20),
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "pin_hash" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "password_changed_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" INTEGER,
    "deletion_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notify_new_tenants" BOOLEAN NOT NULL DEFAULT true,
    "notify_status_changes" BOOLEAN NOT NULL DEFAULT true,
    "notification_frequency" VARCHAR(20) NOT NULL DEFAULT 'immediate',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "super_admin_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token_id" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tenant_id" INTEGER,
    "status" "LoginEventStatus" NOT NULL,
    "ip" VARCHAR(45),
    "user_agent" TEXT,
    "device_id" VARCHAR(64),
    "fail_reason" "login_fail_reason",
    "session_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "last_used_at" TIMESTAMPTZ,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "rate_limit" INTEGER NOT NULL DEFAULT 1000,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ip_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 300,
    "is_write_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_validation_error" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" SERIAL NOT NULL,
    "invitation_id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "invite_channel" "InvitationChannel" NOT NULL DEFAULT 'EMAIL',
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "invited_by" INTEGER NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_at" TIMESTAMPTZ,
    "accepted_by_user_id" INTEGER,
    "cancelled_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "entityType" VARCHAR(30) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "documentType" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_size" INTEGER,
    "mime_type" VARCHAR(100),
    "uploaded_by" INTEGER,
    "tenant_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "s3_key" VARCHAR(500),
    "description" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_external_entities" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "integration_id" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "external_name" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integration_external_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_entity_mappings" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "integration_id" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "internal_entity_id" VARCHAR(50) NOT NULL,
    "external_id" VARCHAR(100),
    "external_name" VARCHAR(500),
    "match_confidence" DOUBLE PRECISION,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integration_entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" SERIAL NOT NULL,
    "integration_id" VARCHAR(50) NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "integration_type" "IntegrationType" NOT NULL,
    "vendor" "IntegrationVendor" NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "credentials" JSONB,
    "realm_id" VARCHAR(30),
    "sync_interval_seconds" INTEGER,
    "last_sync_at" TIMESTAMPTZ,
    "last_success_at" TIMESTAMPTZ,
    "last_error_at" TIMESTAMPTZ,
    "last_error_message" TEXT,
    "sync_metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_configs" (
    "id" SERIAL NOT NULL,
    "vendor_id" VARCHAR(50) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_oauth_enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "custom_display_name" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendor_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "distance_unit" VARCHAR(20) NOT NULL DEFAULT 'MILES',
    "time_format" VARCHAR(10) NOT NULL DEFAULT '12H',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    "date_format" VARCHAR(20) NOT NULL DEFAULT 'MM/DD/YYYY',
    "alert_channels" JSONB NOT NULL DEFAULT '{}',
    "sound_settings" JSONB NOT NULL DEFAULT '{"critical":true,"high":true,"medium":false,"low":false}',
    "notification_preferences" JSONB,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" VARCHAR(10),
    "quiet_hours_end" VARCHAR(10),
    "platform_tour_status" VARCHAR(20),
    "platform_tour_status_at" TIMESTAMPTZ,
    "voice_mode" VARCHAR(10) NOT NULL DEFAULT 'manual',
    "voice_id" VARCHAR(20) NOT NULL DEFAULT 'warm',
    "voice_speed" VARCHAR(10) NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "category" VARCHAR(50) NOT NULL DEFAULT 'general',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "notification_id" VARCHAR(50) NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "recipient" VARCHAR(255) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "tenant_id" INTEGER,
    "user_id" INTEGER,
    "invitation_id" INTEGER,
    "category" "NotificationCategory" NOT NULL,
    "title" VARCHAR(255),
    "message" TEXT,
    "action_url" VARCHAR(500),
    "action_label" VARCHAR(100),
    "icon_type" VARCHAR(30),
    "read_at" TIMESTAMPTZ,
    "dismissed_at" TIMESTAMPTZ,
    "group_key" VARCHAR(100),
    "group_count" INTEGER NOT NULL DEFAULT 1,
    "email_job_id" VARCHAR(100),
    "sms_job_id" VARCHAR(100),
    "metadata" JSONB,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" VARCHAR(200) NOT NULL,
    "auth" VARCHAR(100) NOT NULL,
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "conversation_id" VARCHAR(80) NOT NULL,
    "tenant_id" INTEGER,
    "user_id" INTEGER,
    "user_mode" VARCHAR(20) NOT NULL,
    "title" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "dispatcher_read_at" TIMESTAMPTZ,
    "driver_read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_sessions" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "tenant_id" INTEGER,
    "token" VARCHAR(32) NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" SERIAL NOT NULL,
    "message_id" VARCHAR(50) NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "input_mode" VARCHAR(10) NOT NULL,
    "intent" VARCHAR(50),
    "card" JSONB,
    "action" JSONB,
    "speak_text" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" SERIAL NOT NULL,
    "document_id" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "content_tsv" tsvector,
    "document_type" VARCHAR(50) NOT NULL,
    "audience" VARCHAR(50) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding" vector(1536),
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "parent_doc_id" VARCHAR(50),
    "total_chunks" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_counters" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "submitted_by" INTEGER,
    "category" VARCHAR(30) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "input_data" JSONB NOT NULL,
    "result_data" JSONB,
    "error_message" TEXT,
    "error_details" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "progress" INTEGER,
    "input_hash" VARCHAR(64),
    "queued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "dismissed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_schedules" (
    "id" SERIAL NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "job_type" VARCHAR(50) NOT NULL,
    "schedule_type" VARCHAR(20) NOT NULL,
    "pattern" VARCHAR(100),
    "interval_ms" INTEGER,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "job_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_configs" (
    "id" SERIAL NOT NULL,
    "plan" "TenantPlan" NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "tagline" VARCHAR(255) NOT NULL,
    "price_per_unit" INTEGER,
    "unit_label" VARCHAR(50) NOT NULL DEFAULT 'seat/month',
    "fleet_limit" INTEGER,
    "user_limit" INTEGER,
    "is_popular" BOOLEAN NOT NULL DEFAULT false,
    "cta_label" VARCHAR(100) NOT NULL,
    "cta_url" VARCHAR(500),
    "display_order" INTEGER NOT NULL,
    "provider_price_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "id" SERIAL NOT NULL,
    "plan" "TenantPlan" NOT NULL,
    "feature" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "type" VARCHAR(20) NOT NULL DEFAULT 'software',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_plan_events" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "from_plan" "TenantPlan",
    "to_plan" "TenantPlan" NOT NULL,
    "changed_by" VARCHAR(100) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_plan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_ons" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50),
    "category" VARCHAR(50) NOT NULL,
    "price_cents" INTEGER,
    "billing_interval" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "feature_key" VARCHAR(100) NOT NULL,
    "usage_limits" JSONB,
    "usage_limit_unit" VARCHAR(30),
    "overage_rate_cents" INTEGER,
    "provider_price_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_add_ons" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "add_on_id" TEXT NOT NULL,
    "status" "TenantAddOnStatus" NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "usage_limit" INTEGER,
    "usage_limit_unit" VARCHAR(30),
    "current_usage" INTEGER NOT NULL DEFAULT 0,
    "overage_usage" INTEGER NOT NULL DEFAULT 0,
    "allow_overage" BOOLEAN NOT NULL DEFAULT false,
    "usage_reset_at" TIMESTAMPTZ,
    "activated_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "activated_by" VARCHAR(100),
    "cancelled_by" VARCHAR(100),
    "stripe_subscription_item_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_add_on_events" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "add_on_id" TEXT NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "changed_by" VARCHAR(100) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_add_on_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_on_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "add_on_id" TEXT NOT NULL,
    "status" "AddOnRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_user_id" INTEGER NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_note" TEXT,
    "reviewed_by_user_id" INTEGER,
    "reviewed_at" TIMESTAMPTZ,
    "decline_reason" TEXT,
    "gifted_price_cents" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "add_on_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "secret" VARCHAR(255) NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery_logs" (
    "id" UUID NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "response_status" INTEGER,
    "response_body" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_event_log" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" VARCHAR(100),
    "actor_id" VARCHAR(100),
    "actor_type" VARCHAR(20),
    "actor_label" VARCHAR(100),
    "correlation_id" VARCHAR(50),
    "causation_id" VARCHAR(50),
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_logs" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "queue_name" VARCHAR(40) NOT NULL,
    "job_name" VARCHAR(80) NOT NULL,
    "bull_job_id" VARCHAR(120) NOT NULL,
    "job_db_id" INTEGER,
    "correlation_id" VARCHAR(120),
    "causation_id" VARCHAR(120),
    "payload" JSONB NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_stack" TEXT,
    "attempts" INTEGER NOT NULL,
    "failed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayed_at" TIMESTAMPTZ,
    "replayed_by" VARCHAR(120),
    "replay_job_id" VARCHAR(120),

    CONSTRAINT "dead_letter_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" SERIAL NOT NULL,
    "client_id" VARCHAR(64) NOT NULL,
    "client_secret" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "redirect_uris" TEXT[],
    "scopes" TEXT[],
    "client_type" VARCHAR(20) NOT NULL DEFAULT 'confidential',
    "tenant_id" INTEGER,
    "created_by_user_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_authorization_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "client_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_challenge" VARCHAR(128) NOT NULL,
    "code_challenge_method" VARCHAR(10) NOT NULL DEFAULT 'S256',
    "scopes" TEXT[],
    "redirect_uri" VARCHAR(2048) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_access_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "client_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "client_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "rotated_at" TIMESTAMPTZ,
    "replaced_by_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "original_issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "category" VARCHAR(20),
    "sentiment" INTEGER NOT NULL DEFAULT 3,
    "message" TEXT NOT NULL,
    "page" VARCHAR(500),
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "ticket_number" VARCHAR(20) NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL DEFAULT 'GENERAL',
    "priority" "SupportPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "conversation_id" INTEGER,
    "ai_resolved" BOOLEAN NOT NULL DEFAULT false,
    "related_entities" JSONB,
    "first_response_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" SERIAL NOT NULL,
    "message_id" VARCHAR(50) NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "author_role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "target_type" VARCHAR(20) NOT NULL DEFAULT 'ALL',
    "target_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'INFO',
    "published_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_customers" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "provider_type" "BillingProviderType" NOT NULL,
    "provider_customer_id" VARCHAR(255) NOT NULL,
    "billing_email" VARCHAR(255) NOT NULL,
    "billing_name" VARCHAR(255) NOT NULL,
    "billing_address" JSONB,
    "tax_id" VARCHAR(100),
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "billing_customer_id" TEXT NOT NULL,
    "provider_subscription_id" VARCHAR(255) NOT NULL,
    "plan" "TenantPlan" NOT NULL,
    "status" "BillingSubscriptionStatus" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "interval" VARCHAR(20) NOT NULL DEFAULT 'month',
    "current_period_start" TIMESTAMPTZ NOT NULL,
    "current_period_end" TIMESTAMPTZ NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "pending_downgrade_plan" "TenantPlan",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "balance_cents" INTEGER NOT NULL DEFAULT 0,
    "auto_reload_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_reload_threshold_cents" INTEGER,
    "auto_reload_amount_cents" INTEGER,
    "lifetime_loaded_cents" INTEGER NOT NULL DEFAULT 0,
    "lifetime_consumed_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "balance_after_cents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "related_add_on_id" TEXT,
    "provider_payment_id" VARCHAR(255),
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "billing_customer_id" TEXT NOT NULL,
    "provider_invoice_id" VARCHAR(255) NOT NULL,
    "status" "BillingInvoiceStatus" NOT NULL,
    "amount_due_cents" INTEGER NOT NULL,
    "amount_paid_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMPTZ NOT NULL,
    "period_end" TIMESTAMPTZ NOT NULL,
    "line_items" JSONB NOT NULL,
    "pdf_url" TEXT,
    "hosted_invoice_url" TEXT,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "billing_customer_id" TEXT NOT NULL,
    "provider_payment_method_id" VARCHAR(255) NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "brand" VARCHAR(50) NOT NULL,
    "exp_month" INTEGER NOT NULL,
    "exp_year" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_billing_events" (
    "id" TEXT NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_agents" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "system_prompt_key" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "supervisor_user_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "desk_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_responsibilities" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'COMING_SOON',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autonomy_enabled" BOOLEAN NOT NULL DEFAULT false,
    "trust_level" "TrustLevel" NOT NULL DEFAULT 'SUPERVISED',
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "last_run_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "desk_responsibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_job_runs" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "job_key" VARCHAR(60) NOT NULL,
    "last_run_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_episodes" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "responsibility_id" INTEGER NOT NULL,
    "owner_agent_id" INTEGER NOT NULL,
    "trust_level_snapshot" "TrustLevel" NOT NULL,
    "conditions_snapshot" JSONB NOT NULL,
    "trigger_kind" "TriggerKind" NOT NULL,
    "trigger_label" VARCHAR(160) NOT NULL,
    "trigger_source" VARCHAR(160),
    "trigger_fired_at" TIMESTAMPTZ NOT NULL,
    "trigger_payload" JSONB,
    "entity_type" VARCHAR(40),
    "entity_id" VARCHAR(120),
    "entity_label" VARCHAR(200),
    "status" "DeskEpisodeStatus" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "dedupe_key" VARCHAR(200) NOT NULL,
    "outcome" VARCHAR(40),
    "outcome_note" TEXT,
    "temporal_workflow_id" VARCHAR(200) NOT NULL,
    "temporal_run_id" VARCHAR(100),
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "retrieved_memory_ids" UUID[] DEFAULT ARRAY[]::UUID[],

    CONSTRAINT "desk_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_episode_steps" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "agent_id" INTEGER,
    "sequence" INTEGER NOT NULL,
    "kind" "DeskEpisodeStepKind" NOT NULL,
    "status" "DeskEpisodeStepStatus" NOT NULL,
    "model" VARCHAR(20),
    "prompt_key" VARCHAR(120),
    "ai_invocation_id" UUID,
    "tool_name" VARCHAR(80),
    "tool_scope" VARCHAR(60),
    "tool_tier" VARCHAR(16),
    "tool_args" JSONB,
    "tool_result" JSONB,
    "gate_decision" JSONB,
    "output" JSONB,
    "confidence" DOUBLE PRECISION,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "desk_episode_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_approvals" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "proposed_action" JSONB NOT NULL,
    "claimed_by_user_id" INTEGER,
    "claimed_at" TIMESTAMPTZ,
    "decision" "ApprovalDecision",
    "decided_by_user_id" INTEGER,
    "decided_at" TIMESTAMPTZ,
    "edited_action" JSONB,
    "rejection_reason" TEXT,
    "terminate_episode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "desk_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_memories" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "polarity" "MemoryPolarity" NOT NULL,
    "content" TEXT NOT NULL,
    "content_embedding" vector(1536),
    "entity_ref" JSONB,
    "entity_predicate" JSONB,
    "source_episode_id" UUID,
    "authored_by_user_id" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "desk_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_entity_suppressions" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "responsibility_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "suppress_until" TIMESTAMPTZ,
    "reason" TEXT,
    "set_by_user_id" INTEGER NOT NULL,
    "set_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_episode_id" UUID,
    "unsuppressed_at" TIMESTAMPTZ,
    "unsuppressed_by_user_id" INTEGER,

    CONSTRAINT "desk_entity_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_invocation_logs" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "principal_kind" VARCHAR(32) NOT NULL,
    "principal_id" VARCHAR(128) NOT NULL,
    "principal_label" VARCHAR(160) NOT NULL,
    "tool_name" VARCHAR(80) NOT NULL,
    "scope_required" VARCHAR(60) NOT NULL,
    "hitl_tier" VARCHAR(16) NOT NULL,
    "args_digest" VARCHAR(64) NOT NULL,
    "args_redacted" JSONB NOT NULL,
    "args_raw" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER,
    "error" TEXT,
    "output_summary" VARCHAR(500),
    "pii_read_flag" BOOLEAN NOT NULL DEFAULT false,
    "confirmation_token_id" VARCHAR(128),
    "langfuse_trace_id" VARCHAR(128),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_invocation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hitl_challenges" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "principal_kind" VARCHAR(32) NOT NULL,
    "principal_id" VARCHAR(128) NOT NULL,
    "tool_name" VARCHAR(80) NOT NULL,
    "args_digest" VARCHAR(64) NOT NULL,
    "scope_required" VARCHAR(60) NOT NULL,
    "tier" VARCHAR(16) NOT NULL,
    "step_up_required" BOOLEAN NOT NULL DEFAULT false,
    "step_up_user_id" INTEGER,
    "step_up_completed" BOOLEAN NOT NULL DEFAULT false,
    "consumed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hitl_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_invocations" (
    "id" UUID NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "surface" "AiSurface" NOT NULL,
    "agent_id" VARCHAR(80),
    "model" VARCHAR(80) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_tokens" INTEGER,
    "cost_usd" DECIMAL(12,6),
    "latency_ms" INTEGER,
    "status" "AiInvocationStatus" NOT NULL,
    "error_code" VARCHAR(80),
    "parent_invocation_id" UUID,
    "link_ref_type" VARCHAR(40),
    "link_ref_id" VARCHAR(64),
    "langfuse_trace_id" VARCHAR(128),
    "idempotency_key" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_pricing" (
    "id" SERIAL NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "input_per_mtok_usd" DECIMAL(10,6) NOT NULL,
    "output_per_mtok_usd" DECIMAL(10,6) NOT NULL,
    "cached_input_per_mtok_usd" DECIMAL(10,6),
    "effective_from_date" DATE NOT NULL,
    "effective_until_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ai_budgets" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "daily_soft_usd" DECIMAL(10,2) NOT NULL DEFAULT 5,
    "daily_hard_usd" DECIMAL(10,2) NOT NULL DEFAULT 20,
    "monthly_soft_usd" DECIMAL(10,2) NOT NULL DEFAULT 50,
    "monthly_hard_usd" DECIMAL(10,2) NOT NULL DEFAULT 200,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_ai_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_tenant_id_key" ON "tenants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_desk_schedule_enabled_idx" ON "tenants"("desk_schedule_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "users_user_id_key" ON "users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_firebase_uid_idx" ON "users"("firebase_uid");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_preferences_user_id_key" ON "super_admin_preferences"("user_id");

-- CreateIndex
CREATE INDEX "super_admin_preferences_user_id_idx" ON "super_admin_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_id_key" ON "refresh_tokens"("token_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "login_events_tenant_id_created_at_idx" ON "login_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "login_events_created_at_idx" ON "login_events"("created_at");

-- CreateIndex
CREATE INDEX "idx_login_event_tenant_status_created" ON "login_events"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_login_event_tenant_user_created" ON "login_events"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_user_id_revoked_at_idx" ON "api_keys"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_invitation_id_key" ON "user_invitations"("invitation_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_key" ON "user_invitations"("token");

-- CreateIndex
CREATE INDEX "user_invitations_tenant_id_idx" ON "user_invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "user_invitations_token_idx" ON "user_invitations"("token");

-- CreateIndex
CREATE INDEX "user_invitations_email_idx" ON "user_invitations"("email");

-- CreateIndex
CREATE INDEX "user_invitations_expires_at_idx" ON "user_invitations"("expires_at");

-- CreateIndex
CREATE INDEX "user_invitations_status_idx" ON "user_invitations"("status");

-- CreateIndex
CREATE INDEX "documents_entityType_entity_id_idx" ON "documents"("entityType", "entity_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "integration_external_entities_tenant_id_idx" ON "integration_external_entities"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_external_entities_integration_id_entity_type_ex_key" ON "integration_external_entities"("integration_id", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "integration_entity_mappings_tenant_id_idx" ON "integration_entity_mappings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "iem_integration_type_internal_unique" ON "integration_entity_mappings"("integration_id", "entity_type", "internal_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_integration_id_key" ON "integration_configs"("integration_id");

-- CreateIndex
CREATE INDEX "integration_configs_status_idx" ON "integration_configs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_tenant_id_integration_type_vendor_key" ON "integration_configs"("tenant_id", "integration_type", "vendor");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_configs_vendor_id_key" ON "vendor_configs"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE INDEX "user_preferences_user_id_idx" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flags_key_idx" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flags_category_idx" ON "feature_flags"("category");

-- CreateIndex
CREATE INDEX "feature_flags_enabled_idx" ON "feature_flags"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_notification_id_key" ON "notifications"("notification_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_status_idx" ON "notifications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "notifications_type_status_idx" ON "notifications"("type", "status");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_dismissed_at_idx" ON "notifications"("user_id", "read_at", "dismissed_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_category_created_at_idx" ON "notifications"("user_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "idx_notification_grouping" ON "notifications"("type", "user_id", "tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_user_id_endpoint_key" ON "push_subscriptions"("user_id", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_conversation_id_key" ON "conversations"("conversation_id");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_user_mode_title_idx" ON "conversations"("tenant_id", "user_mode", "title");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_user_id_created_at_idx" ON "conversations"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_sessions_token_key" ON "conversation_sessions"("token");

-- CreateIndex
CREATE INDEX "conversation_sessions_conversation_id_idx" ON "conversation_sessions"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_sessions_token_idx" ON "conversation_sessions"("token");

-- CreateIndex
CREATE INDEX "conversation_sessions_tenant_id_created_at_idx" ON "conversation_sessions"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_message_id_key" ON "conversation_messages"("message_id");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_document_id_key" ON "knowledge_documents"("document_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_document_type_audience_idx" ON "knowledge_documents"("document_type", "audience");

-- CreateIndex
CREATE INDEX "knowledge_documents_audience_idx" ON "knowledge_documents"("audience");

-- CreateIndex
CREATE INDEX "knowledge_documents_category_idx" ON "knowledge_documents"("category");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_counters_tenant_id_key_key" ON "tenant_counters"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_status_idx" ON "jobs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "jobs_category_type_status_idx" ON "jobs"("category", "type", "status");

-- CreateIndex
CREATE INDEX "jobs_submitted_by_status_idx" ON "jobs"("submitted_by", "status");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_input_hash_idx" ON "jobs"("tenant_id", "input_hash");

-- CreateIndex
CREATE INDEX "jobs_tenant_category_created" ON "jobs"("tenant_id", "category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_schedules_category_job_type_key" ON "job_schedules"("category", "job_type");

-- CreateIndex
CREATE UNIQUE INDEX "plan_configs_plan_key" ON "plan_configs"("plan");

-- CreateIndex
CREATE INDEX "plan_entitlements_plan_idx" ON "plan_entitlements"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_plan_feature_key" ON "plan_entitlements"("plan", "feature");

-- CreateIndex
CREATE INDEX "tenant_plan_events_tenant_id_idx" ON "tenant_plan_events"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "add_ons_slug_key" ON "add_ons"("slug");

-- CreateIndex
CREATE INDEX "add_ons_feature_key_idx" ON "add_ons"("feature_key");

-- CreateIndex
CREATE INDEX "add_ons_is_active_display_order_idx" ON "add_ons"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "tenant_add_ons_tenant_id_status_idx" ON "tenant_add_ons"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenant_add_ons_add_on_id_idx" ON "tenant_add_ons"("add_on_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_add_ons_tenant_id_add_on_id_key" ON "tenant_add_ons"("tenant_id", "add_on_id");

-- CreateIndex
CREATE INDEX "tenant_add_on_events_tenant_id_idx" ON "tenant_add_on_events"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_add_on_events_add_on_id_idx" ON "tenant_add_on_events"("add_on_id");

-- CreateIndex
CREATE INDEX "add_on_requests_tenant_id_status_idx" ON "add_on_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "add_on_requests_status_idx" ON "add_on_requests"("status");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_tenant_id_active_idx" ON "webhook_subscriptions"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_subscription_id_created_at_idx" ON "webhook_delivery_logs"("subscription_id", "created_at");

-- CreateIndex
CREATE INDEX "domain_event_log_tenant_id_created_at_idx" ON "domain_event_log"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "domain_event_log_tenant_id_event_idx" ON "domain_event_log"("tenant_id", "event");

-- CreateIndex
CREATE INDEX "domain_event_log_tenant_id_aggregate_type_aggregate_id_idx" ON "domain_event_log"("tenant_id", "aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "domain_event_log_correlation_id_idx" ON "domain_event_log"("correlation_id");

-- CreateIndex
CREATE INDEX "dead_letter_logs_tenant_id_queue_name_failed_at_idx" ON "dead_letter_logs"("tenant_id", "queue_name", "failed_at");

-- CreateIndex
CREATE INDEX "dead_letter_logs_bull_job_id_idx" ON "dead_letter_logs"("bull_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_client_id_key" ON "oauth_clients"("client_id");

-- CreateIndex
CREATE INDEX "oauth_clients_tenant_id_idx" ON "oauth_clients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_authorization_codes_code_key" ON "oauth_authorization_codes"("code");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_code_idx" ON "oauth_authorization_codes"("code");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_expires_at_idx" ON "oauth_authorization_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_access_tokens_token_hash_key" ON "oauth_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_token_hash_idx" ON "oauth_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_user_id_idx" ON "oauth_access_tokens"("user_id");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_expires_at_idx" ON "oauth_access_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_refresh_tokens_token_hash_key" ON "oauth_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_token_hash_idx" ON "oauth_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_user_id_idx" ON "oauth_refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_expires_at_idx" ON "oauth_refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "feedback_tenant_id_idx" ON "feedback"("tenant_id");

-- CreateIndex
CREATE INDEX "feedback_status_idx" ON "feedback"("status");

-- CreateIndex
CREATE INDEX "feedback_created_at_idx" ON "feedback"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_conversation_id_key" ON "support_tickets"("conversation_id");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_status_idx" ON "support_tickets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_created_at_idx" ON "support_tickets"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_created_by_id_idx" ON "support_tickets"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_messages_message_id_key" ON "support_ticket_messages"("message_id");

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticket_id_created_at_idx" ON "support_ticket_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "announcements_status_idx" ON "announcements"("status");

-- CreateIndex
CREATE INDEX "announcements_created_at_idx" ON "announcements"("created_at");

-- CreateIndex
CREATE INDEX "announcements_status_published_at_idx" ON "announcements"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_tenant_id_key" ON "billing_customers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_provider_customer_id_key" ON "billing_customers"("provider_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_id_key" ON "billing_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_tenant_id_idx" ON "billing_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_billing_customer_id_idx" ON "billing_subscriptions"("billing_customer_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_status_idx" ON "billing_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_tenant_id_key" ON "wallets"("tenant_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_tenant_id_idx" ON "wallet_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_provider_invoice_id_key" ON "billing_invoices"("provider_invoice_id");

-- CreateIndex
CREATE INDEX "billing_invoices_tenant_id_idx" ON "billing_invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_invoices_billing_customer_id_idx" ON "billing_invoices"("billing_customer_id");

-- CreateIndex
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_provider_payment_method_id_key" ON "payment_methods"("provider_payment_method_id");

-- CreateIndex
CREATE INDEX "payment_methods_tenant_id_idx" ON "payment_methods"("tenant_id");

-- CreateIndex
CREATE INDEX "payment_methods_billing_customer_id_idx" ON "payment_methods"("billing_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_billing_events_provider_event_id_key" ON "processed_billing_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "desk_agents_supervisor_user_id_idx" ON "desk_agents"("supervisor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "desk_agents_tenant_id_key_key" ON "desk_agents"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "desk_responsibilities_tenant_id_enabled_lifecycle_idx" ON "desk_responsibilities"("tenant_id", "enabled", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "desk_responsibilities_tenant_id_key_key" ON "desk_responsibilities"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "tenant_job_runs_tenant_id_idx" ON "tenant_job_runs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_job_runs_tenant_id_job_key_key" ON "tenant_job_runs"("tenant_id", "job_key");

-- CreateIndex
CREATE INDEX "desk_episodes_tenant_id_dedupe_key_idx" ON "desk_episodes"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "desk_episodes_tenant_id_status_priority_idx" ON "desk_episodes"("tenant_id", "status", "priority");

-- CreateIndex
CREATE INDEX "desk_episodes_tenant_id_responsibility_id_status_idx" ON "desk_episodes"("tenant_id", "responsibility_id", "status");

-- CreateIndex
CREATE INDEX "desk_episodes_entity_type_entity_id_idx" ON "desk_episodes"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "desk_episodes_temporal_workflow_id_idx" ON "desk_episodes"("temporal_workflow_id");

-- CreateIndex
CREATE INDEX "desk_episode_steps_episode_id_idx" ON "desk_episode_steps"("episode_id");

-- CreateIndex
CREATE INDEX "desk_episode_steps_tool_name_idx" ON "desk_episode_steps"("tool_name");

-- CreateIndex
CREATE INDEX "desk_episode_steps_ai_invocation_id_idx" ON "desk_episode_steps"("ai_invocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "desk_episode_steps_episode_id_sequence_key" ON "desk_episode_steps"("episode_id", "sequence");

-- CreateIndex
CREATE INDEX "desk_approvals_episode_id_decision_idx" ON "desk_approvals"("episode_id", "decision");

-- CreateIndex
CREATE INDEX "desk_approvals_step_id_idx" ON "desk_approvals"("step_id");

-- CreateIndex
CREATE INDEX "desk_memories_tenant_id_agent_id_is_active_idx" ON "desk_memories"("tenant_id", "agent_id", "is_active");

-- CreateIndex
CREATE INDEX "desk_memories_scope_polarity_idx" ON "desk_memories"("scope", "polarity");

-- CreateIndex
CREATE INDEX "desk_memories_authored_by_user_id_idx" ON "desk_memories"("authored_by_user_id");

-- CreateIndex
CREATE INDEX "desk_memories_is_active_expires_at_idx" ON "desk_memories"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "desk_entity_suppressions_tenant_id_responsibility_key_entit_idx" ON "desk_entity_suppressions"("tenant_id", "responsibility_key", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "agent_invocation_logs_tenant_id_created_at_idx" ON "agent_invocation_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_invocation_logs_tenant_id_principal_kind_principal_id_idx" ON "agent_invocation_logs"("tenant_id", "principal_kind", "principal_id");

-- CreateIndex
CREATE INDEX "agent_invocation_logs_tenant_id_tool_name_idx" ON "agent_invocation_logs"("tenant_id", "tool_name");

-- CreateIndex
CREATE INDEX "hitl_challenges_tenant_id_expires_at_idx" ON "hitl_challenges"("tenant_id", "expires_at");

-- CreateIndex
CREATE INDEX "hitl_challenges_tenant_id_principal_id_consumed_at_idx" ON "hitl_challenges"("tenant_id", "principal_id", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_invocations_idempotency_key_key" ON "ai_invocations"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_invocations_tenant_id_created_at_idx" ON "ai_invocations"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_invocations_tenant_id_surface_created_at_idx" ON "ai_invocations"("tenant_id", "surface", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_invocations_link_ref_type_link_ref_id_idx" ON "ai_invocations"("link_ref_type", "link_ref_id");

-- CreateIndex
CREATE INDEX "ai_invocations_parent_invocation_id_idx" ON "ai_invocations"("parent_invocation_id");

-- CreateIndex
CREATE INDEX "model_pricing_provider_model_effective_from_date_idx" ON "model_pricing"("provider", "model", "effective_from_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "model_pricing_provider_model_effective_from_date_key" ON "model_pricing"("provider", "model", "effective_from_date");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ai_budgets_tenant_id_key" ON "tenant_ai_budgets"("tenant_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_preferences" ADD CONSTRAINT "super_admin_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_external_entities" ADD CONSTRAINT "integration_external_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_entity_mappings" ADD CONSTRAINT "integration_entity_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "user_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_plan_events" ADD CONSTRAINT "tenant_plan_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_add_ons" ADD CONSTRAINT "tenant_add_ons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_add_ons" ADD CONSTRAINT "tenant_add_ons_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_add_on_events" ADD CONSTRAINT "tenant_add_on_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_add_on_events" ADD CONSTRAINT "tenant_add_on_events_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_requests" ADD CONSTRAINT "add_on_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_requests" ADD CONSTRAINT "add_on_requests_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_event_log" ADD CONSTRAINT "domain_event_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_logs" ADD CONSTRAINT "dead_letter_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_related_add_on_id_fkey" FOREIGN KEY ("related_add_on_id") REFERENCES "add_ons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_agents" ADD CONSTRAINT "desk_agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_agents" ADD CONSTRAINT "desk_agents_supervisor_user_id_fkey" FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_responsibilities" ADD CONSTRAINT "desk_responsibilities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_responsibilities" ADD CONSTRAINT "desk_responsibilities_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "desk_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_job_runs" ADD CONSTRAINT "tenant_job_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_episodes" ADD CONSTRAINT "desk_episodes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_episodes" ADD CONSTRAINT "desk_episodes_responsibility_id_fkey" FOREIGN KEY ("responsibility_id") REFERENCES "desk_responsibilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_episodes" ADD CONSTRAINT "desk_episodes_owner_agent_id_fkey" FOREIGN KEY ("owner_agent_id") REFERENCES "desk_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_episode_steps" ADD CONSTRAINT "desk_episode_steps_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "desk_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_episode_steps" ADD CONSTRAINT "desk_episode_steps_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "desk_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_episode_steps" ADD CONSTRAINT "desk_episode_steps_ai_invocation_id_fkey" FOREIGN KEY ("ai_invocation_id") REFERENCES "ai_invocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_approvals" ADD CONSTRAINT "desk_approvals_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "desk_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_approvals" ADD CONSTRAINT "desk_approvals_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "desk_episode_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_approvals" ADD CONSTRAINT "desk_approvals_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_approvals" ADD CONSTRAINT "desk_approvals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_memories" ADD CONSTRAINT "desk_memories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_memories" ADD CONSTRAINT "desk_memories_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "desk_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_memories" ADD CONSTRAINT "desk_memories_authored_by_user_id_fkey" FOREIGN KEY ("authored_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_entity_suppressions" ADD CONSTRAINT "desk_entity_suppressions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_entity_suppressions" ADD CONSTRAINT "desk_entity_suppressions_set_by_user_id_fkey" FOREIGN KEY ("set_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_entity_suppressions" ADD CONSTRAINT "desk_entity_suppressions_source_episode_id_fkey" FOREIGN KEY ("source_episode_id") REFERENCES "desk_episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_entity_suppressions" ADD CONSTRAINT "desk_entity_suppressions_unsuppressed_by_user_id_fkey" FOREIGN KEY ("unsuppressed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_invocation_logs" ADD CONSTRAINT "agent_invocation_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hitl_challenges" ADD CONSTRAINT "hitl_challenges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_parent_invocation_id_fkey" FOREIGN KEY ("parent_invocation_id") REFERENCES "ai_invocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ai_budgets" ADD CONSTRAINT "tenant_ai_budgets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Vector / full-text indexes for AI knowledge base + Desk memory
-- (pgvector ivfflat for ANN search; GIN for tsvector full-text)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "knowledge_documents_embedding_idx"
  ON "knowledge_documents" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS "knowledge_documents_content_tsv_idx"
  ON "knowledge_documents" USING gin ("content_tsv");
CREATE INDEX IF NOT EXISTS "desk_memories_content_embedding_idx"
  ON "desk_memories" USING ivfflat ("content_embedding" vector_cosine_ops) WITH (lists = 100);

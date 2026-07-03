/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Run `pnpm --filter @appshore/db prisma:generate` to regenerate from
 * `packages/foundation/db/prisma/schema/*.prisma`.
 *
 * Source:    packages/foundation/db/prisma/schema/*.prisma
 * Generator: packages/foundation/db/scripts/generate-shared-enums.ts
 *
 * CI guarantees this file stays in sync via
 * apps/backend/src/architecture/enum-codegen-parity.spec.ts — it
 * regenerates on every run and fails on any diff.
 */
import { z } from 'zod';

// AddOnRequestStatus
export const AddOnRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'DECLINED'] as const);
export type AddOnRequestStatus = z.infer<typeof AddOnRequestStatusSchema>;
export const AddOnRequestStatus = AddOnRequestStatusSchema.enum;

// AiInvocationStatus
export const AiInvocationStatusSchema = z.enum(['OK', 'ERROR', 'TIMEOUT', 'RATE_LIMITED', 'BUDGET_BLOCKED'] as const);
export type AiInvocationStatus = z.infer<typeof AiInvocationStatusSchema>;
export const AiInvocationStatus = AiInvocationStatusSchema.enum;

// AiSurface
export const AiSurfaceSchema = z.enum(['CHAT', 'DESK_STEP', 'MEMORY_EXTRACT', 'EMBEDDING', 'KB_INGEST'] as const);
export type AiSurface = z.infer<typeof AiSurfaceSchema>;
export const AiSurface = AiSurfaceSchema.enum;

// AnnouncementPriority
export const AnnouncementPrioritySchema = z.enum(['INFO', 'WARNING', 'CRITICAL'] as const);
export type AnnouncementPriority = z.infer<typeof AnnouncementPrioritySchema>;
export const AnnouncementPriority = AnnouncementPrioritySchema.enum;

// AnnouncementStatus
export const AnnouncementStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const);
export type AnnouncementStatus = z.infer<typeof AnnouncementStatusSchema>;
export const AnnouncementStatus = AnnouncementStatusSchema.enum;

// ApprovalDecision
export const ApprovalDecisionSchema = z.enum(['APPROVED', 'EDITED', 'REJECTED'] as const);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export const ApprovalDecision = ApprovalDecisionSchema.enum;

// BillingInvoiceStatus
export const BillingInvoiceStatusSchema = z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'] as const);
export type BillingInvoiceStatus = z.infer<typeof BillingInvoiceStatusSchema>;
export const BillingInvoiceStatus = BillingInvoiceStatusSchema.enum;

// BillingProviderType
export const BillingProviderTypeSchema = z.enum(['STRIPE'] as const);
export type BillingProviderType = z.infer<typeof BillingProviderTypeSchema>;
export const BillingProviderType = BillingProviderTypeSchema.enum;

// BillingSubscriptionStatus
export const BillingSubscriptionStatusSchema = z.enum(['ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED', 'TRIALING'] as const);
export type BillingSubscriptionStatus = z.infer<typeof BillingSubscriptionStatusSchema>;
export const BillingSubscriptionStatus = BillingSubscriptionStatusSchema.enum;

// DeskEpisodeStatus
export const DeskEpisodeStatusSchema = z.enum(['RUNNING', 'WAITING_APPROVAL', 'RESOLVED', 'ESCALATED', 'FAILED', 'REJECTED_BY_OPERATOR', 'CANCELLED', 'EXPIRED'] as const);
export type DeskEpisodeStatus = z.infer<typeof DeskEpisodeStatusSchema>;
export const DeskEpisodeStatus = DeskEpisodeStatusSchema.enum;

// DeskEpisodeStepKind
export const DeskEpisodeStepKindSchema = z.enum(['HYDRATE', 'PERCEIVE', 'DECIDE', 'DRAFT', 'GATE', 'EXECUTE', 'CLOSE'] as const);
export type DeskEpisodeStepKind = z.infer<typeof DeskEpisodeStepKindSchema>;
export const DeskEpisodeStepKind = DeskEpisodeStepKindSchema.enum;

// DeskEpisodeStepStatus
export const DeskEpisodeStepStatusSchema = z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'GATED', 'SKIPPED'] as const);
export type DeskEpisodeStepStatus = z.infer<typeof DeskEpisodeStepStatusSchema>;
export const DeskEpisodeStepStatus = DeskEpisodeStepStatusSchema.enum;

// DocumentStatus
export const DocumentStatusSchema = z.enum(['PENDING_UPLOAD', 'CONFIRMED', 'EXPIRED', 'DELETED'] as const);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;
export const DocumentStatus = DocumentStatusSchema.enum;

// FeedbackStatus
export const FeedbackStatusSchema = z.enum(['NEW', 'REVIEWED', 'RESOLVED'] as const);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;
export const FeedbackStatus = FeedbackStatusSchema.enum;

// IntegrationStatus
export const IntegrationStatusSchema = z.enum(['NOT_CONFIGURED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED', 'NEEDS_RECONNECT'] as const);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;
export const IntegrationStatus = IntegrationStatusSchema.enum;

// IntegrationType
export const IntegrationTypeSchema = z.enum(['ACCOUNTING'] as const);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;
export const IntegrationType = IntegrationTypeSchema.enum;

// IntegrationVendor
export const IntegrationVendorSchema = z.enum(['QUICKBOOKS'] as const);
export type IntegrationVendor = z.infer<typeof IntegrationVendorSchema>;
export const IntegrationVendor = IntegrationVendorSchema.enum;

// InvitationChannel
export const InvitationChannelSchema = z.enum(['EMAIL', 'SMS'] as const);
export type InvitationChannel = z.infer<typeof InvitationChannelSchema>;
export const InvitationChannel = InvitationChannelSchema.enum;

// InvitationStatus
export const InvitationStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED'] as const);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;
export const InvitationStatus = InvitationStatusSchema.enum;

// JobStatus
export const JobStatusSchema = z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const);
export type JobStatus = z.infer<typeof JobStatusSchema>;
export const JobStatus = JobStatusSchema.enum;

// Lifecycle
export const LifecycleSchema = z.enum(['AVAILABLE', 'COMING_SOON'] as const);
export type Lifecycle = z.infer<typeof LifecycleSchema>;
export const Lifecycle = LifecycleSchema.enum;

// LoginEventStatus
export const LoginEventStatusSchema = z.enum(['SUCCESS', 'FAILED', 'LOGOUT'] as const);
export type LoginEventStatus = z.infer<typeof LoginEventStatusSchema>;
export const LoginEventStatus = LoginEventStatusSchema.enum;

// LoginFailReason
export const LoginFailReasonSchema = z.enum(['ACCOUNT_DISABLED', 'TENANT_INACTIVE', 'INVALID_TOKEN', 'USER_NOT_FOUND', 'OTHER'] as const);
export type LoginFailReason = z.infer<typeof LoginFailReasonSchema>;
export const LoginFailReason = LoginFailReasonSchema.enum;

// MemoryPolarity
export const MemoryPolaritySchema = z.enum(['REINFORCE', 'CORRECT'] as const);
export type MemoryPolarity = z.infer<typeof MemoryPolaritySchema>;
export const MemoryPolarity = MemoryPolaritySchema.enum;

// MemoryScope
export const MemoryScopeSchema = z.enum(['ENTITY', 'PATTERN', 'PLAYBOOK'] as const);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export const MemoryScope = MemoryScopeSchema.enum;

// NotificationCategory
export const NotificationCategorySchema = z.enum(['SYSTEM', 'TEAM', 'BILLING'] as const);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;
export const NotificationCategory = NotificationCategorySchema.enum;

// NotificationChannel
export const NotificationChannelSchema = z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP'] as const);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export const NotificationChannel = NotificationChannelSchema.enum;

// NotificationStatus
export const NotificationStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED'] as const);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;
export const NotificationStatus = NotificationStatusSchema.enum;

// NotificationType
export const NotificationTypeSchema = z.enum(['USER_INVITATION', 'TENANT_REGISTRATION_CONFIRMATION', 'TENANT_APPROVED', 'TENANT_REJECTED', 'INTEGRATION_SYNC_COMPLETED', 'INTEGRATION_SYNC_FAILED', 'SETTINGS_UPDATED', 'USER_JOINED', 'ROLE_CHANGED'] as const);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export const NotificationType = NotificationTypeSchema.enum;

// PaymentMethodType
export const PaymentMethodTypeSchema = z.enum(['CARD', 'US_BANK_ACCOUNT'] as const);
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>;
export const PaymentMethodType = PaymentMethodTypeSchema.enum;

// Priority
export const PrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const);
export type Priority = z.infer<typeof PrioritySchema>;
export const Priority = PrioritySchema.enum;

// SupportCategory
export const SupportCategorySchema = z.enum(['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL'] as const);
export type SupportCategory = z.infer<typeof SupportCategorySchema>;
export const SupportCategory = SupportCategorySchema.enum;

// SupportPriority
export const SupportPrioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const);
export type SupportPriority = z.infer<typeof SupportPrioritySchema>;
export const SupportPriority = SupportPrioritySchema.enum;

// SupportStatus
export const SupportStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'] as const);
export type SupportStatus = z.infer<typeof SupportStatusSchema>;
export const SupportStatus = SupportStatusSchema.enum;

// TenantAddOnStatus
export const TenantAddOnStatusSchema = z.enum(['ACTIVE', 'CANCELLED', 'SUSPENDED'] as const);
export type TenantAddOnStatus = z.infer<typeof TenantAddOnStatusSchema>;
export const TenantAddOnStatus = TenantAddOnStatusSchema.enum;

// TenantPlan
export const TenantPlanSchema = z.enum(['TRIAL', 'TRIAL_EXPIRED', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'SUSPENDED'] as const);
export type TenantPlan = z.infer<typeof TenantPlanSchema>;
export const TenantPlan = TenantPlanSchema.enum;

// TenantStatus
export const TenantStatusSchema = z.enum(['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;
export const TenantStatus = TenantStatusSchema.enum;

// TriggerKind
export const TriggerKindSchema = z.enum(['SCHEDULED', 'DOMAIN_EVENT', 'WEBHOOK', 'MANUAL'] as const);
export type TriggerKind = z.infer<typeof TriggerKindSchema>;
export const TriggerKind = TriggerKindSchema.enum;

// TrustLevel
export const TrustLevelSchema = z.enum(['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'] as const);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;
export const TrustLevel = TrustLevelSchema.enum;

// UserRole
export const UserRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'SUPER_ADMIN'] as const);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const UserRole = UserRoleSchema.enum;

// WalletTransactionType
export const WalletTransactionTypeSchema = z.enum(['TOP_UP', 'OVERAGE_DEDUCTION', 'ADMIN_CREDIT', 'REFUND', 'AUTO_RELOAD'] as const);
export type WalletTransactionType = z.infer<typeof WalletTransactionTypeSchema>;
export const WalletTransactionType = WalletTransactionTypeSchema.enum;

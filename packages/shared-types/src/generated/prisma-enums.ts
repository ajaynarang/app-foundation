/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Run `pnpm prisma:generate` from `apps/backend` to regenerate from
 * `prisma/schema.prisma`.
 *
 * Source:    apps/backend/prisma/schema.prisma
 * Generator: apps/backend/scripts/generate-shared-enums.ts
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
export const AiSurfaceSchema = z.enum(['SALLY_CHAT', 'DESK_STEP', 'DOC_RATECON', 'DOC_FUEL_RECEIPT', 'ALERT_BRIEFING', 'MEMORY_EXTRACT', 'EMBEDDING', 'KB_INGEST'] as const);
export type AiSurface = z.infer<typeof AiSurfaceSchema>;
export const AiSurface = AiSurfaceSchema.enum;

// AlertPriority
export const AlertPrioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const);
export type AlertPriority = z.infer<typeof AlertPrioritySchema>;
export const AlertPriority = AlertPrioritySchema.enum;

// AlertScope
export const AlertScopeSchema = z.enum(['LOAD', 'FLEET'] as const);
export type AlertScope = z.infer<typeof AlertScopeSchema>;
export const AlertScope = AlertScopeSchema.enum;

// AlertStatus
export const AlertStatusSchema = z.enum(['ACTIVE', 'ACKNOWLEDGED', 'SNOOZED', 'RESOLVED', 'AUTO_RESOLVED'] as const);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export const AlertStatus = AlertStatusSchema.enum;

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

// BillingPath
export const BillingPathSchema = z.enum(['FACTORED', 'DIRECT', 'AMAZON'] as const);
export type BillingPath = z.infer<typeof BillingPathSchema>;
export const BillingPath = BillingPathSchema.enum;

// BillingProviderType
export const BillingProviderTypeSchema = z.enum(['STRIPE'] as const);
export type BillingProviderType = z.infer<typeof BillingProviderTypeSchema>;
export const BillingProviderType = BillingProviderTypeSchema.enum;

// BillingSubscriptionStatus
export const BillingSubscriptionStatusSchema = z.enum(['ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED', 'TRIALING'] as const);
export type BillingSubscriptionStatus = z.infer<typeof BillingSubscriptionStatusSchema>;
export const BillingSubscriptionStatus = BillingSubscriptionStatusSchema.enum;

// BundleFormat
export const BundleFormatSchema = z.enum(['ZIP', 'MERGED_PDF'] as const);
export type BundleFormat = z.infer<typeof BundleFormatSchema>;
export const BundleFormat = BundleFormatSchema.enum;

// CarrierType
export const CarrierTypeSchema = z.enum(['FOR_HIRE_INTERSTATE', 'INTRASTATE_ONLY', 'PRIVATE_FLEET', 'LEASED_ON'] as const);
export type CarrierType = z.infer<typeof CarrierTypeSchema>;
export const CarrierType = CarrierTypeSchema.enum;

// CdlClass
export const CdlClassSchema = z.enum(['A', 'B', 'C'] as const);
export type CdlClass = z.infer<typeof CdlClassSchema>;
export const CdlClass = CdlClassSchema.enum;

// ContactRole
export const ContactRoleSchema = z.enum(['PRIMARY', 'OPERATIONS', 'BILLING', 'CLAIMS', 'AFTER_HOURS', 'OTHER'] as const);
export type ContactRole = z.infer<typeof ContactRoleSchema>;
export const ContactRole = ContactRoleSchema.enum;

// ContactStatus
export const ContactStatusSchema = z.enum(['ACTIVE', 'INACTIVE'] as const);
export type ContactStatus = z.infer<typeof ContactStatusSchema>;
export const ContactStatus = ContactStatusSchema.enum;

// CustomerStatus
export const CustomerStatusSchema = z.enum(['ACTIVE', 'ON_HOLD', 'SUSPENDED', 'INACTIVE'] as const);
export type CustomerStatus = z.infer<typeof CustomerStatusSchema>;
export const CustomerStatus = CustomerStatusSchema.enum;

// CustomerType
export const CustomerTypeSchema = z.enum(['SHIPPER', 'BROKER', 'THREE_PL', 'CARRIER'] as const);
export type CustomerType = z.infer<typeof CustomerTypeSchema>;
export const CustomerType = CustomerTypeSchema.enum;

// CustomFieldEntityType
export const CustomFieldEntityTypeSchema = z.enum(['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER'] as const);
export type CustomFieldEntityType = z.infer<typeof CustomFieldEntityTypeSchema>;
export const CustomFieldEntityType = CustomFieldEntityTypeSchema.enum;

// CustomFieldType
export const CustomFieldTypeSchema = z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT'] as const);
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>;
export const CustomFieldType = CustomFieldTypeSchema.enum;

// DeductionType
export const DeductionTypeSchema = z.enum(['FUEL_ADVANCE', 'CASH_ADVANCE', 'INSURANCE', 'EQUIPMENT_LEASE', 'ESCROW', 'OTHER'] as const);
export type DeductionType = z.infer<typeof DeductionTypeSchema>;
export const DeductionType = DeductionTypeSchema.enum;

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

// DriverActionRequestStatus
export const DriverActionRequestStatusSchema = z.enum(['SUBMITTED', 'ACKNOWLEDGED', 'RESOLVED'] as const);
export type DriverActionRequestStatus = z.infer<typeof DriverActionRequestStatusSchema>;
export const DriverActionRequestStatus = DriverActionRequestStatusSchema.enum;

// DriverDutyStatus
export const DriverDutyStatusSchema = z.enum(['DRIVING', 'ON_DUTY', 'OFF_DUTY', 'SLEEPER'] as const);
export type DriverDutyStatus = z.infer<typeof DriverDutyStatusSchema>;
export const DriverDutyStatus = DriverDutyStatusSchema.enum;

// DriverPayTiming
export const DriverPayTimingSchema = z.enum(['ON_DELIVERY', 'ON_FACTOR_FUND'] as const);
export type DriverPayTiming = z.infer<typeof DriverPayTimingSchema>;
export const DriverPayTiming = DriverPayTimingSchema.enum;

// DriverStatus
export const DriverStatusSchema = z.enum(['PENDING_ACTIVATION', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REMOVED_FROM_SOURCE'] as const);
export type DriverStatus = z.infer<typeof DriverStatusSchema>;
export const DriverStatus = DriverStatusSchema.enum;

// DriverUnavailabilityType
export const DriverUnavailabilityTypeSchema = z.enum(['PTO', 'APPOINTMENT', 'HOME_TIME', 'TRAINING', 'OTHER'] as const);
export type DriverUnavailabilityType = z.infer<typeof DriverUnavailabilityTypeSchema>;
export const DriverUnavailabilityType = DriverUnavailabilityTypeSchema.enum;

// EDIDirection
export const EDIDirectionSchema = z.enum(['INBOUND', 'OUTBOUND'] as const);
export type EDIDirection = z.infer<typeof EDIDirectionSchema>;
export const EDIDirection = EDIDirectionSchema.enum;

// EDIMessageStatus
export const EDIMessageStatusSchema = z.enum(['RECEIVED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'EXPIRED'] as const);
export type EDIMessageStatus = z.infer<typeof EDIMessageStatusSchema>;
export const EDIMessageStatus = EDIMessageStatusSchema.enum;

// EDIMessageType
export const EDIMessageTypeSchema = z.enum(['T204', 'T210', 'T214', 'T990', 'T997'] as const);
export type EDIMessageType = z.infer<typeof EDIMessageTypeSchema>;
export const EDIMessageType = EDIMessageTypeSchema.enum;

// EDIStatusUpdateLevel
export const EDIStatusUpdateLevelSchema = z.enum(['STANDARD', 'ENHANCED'] as const);
export type EDIStatusUpdateLevel = z.infer<typeof EDIStatusUpdateLevelSchema>;
export const EDIStatusUpdateLevel = EDIStatusUpdateLevelSchema.enum;

// EDITenderResponse
export const EDITenderResponseSchema = z.enum(['ACCEPTED', 'DECLINED', 'COUNTERED', 'EXPIRED'] as const);
export type EDITenderResponse = z.infer<typeof EDITenderResponseSchema>;
export const EDITenderResponse = EDITenderResponseSchema.enum;

// EDIVanProvider
export const EDIVanProviderSchema = z.enum(['SPS_COMMERCE', 'DIRECT'] as const);
export type EDIVanProvider = z.infer<typeof EDIVanProviderSchema>;
export const EDIVanProvider = EDIVanProviderSchema.enum;

// EmailIngestFilterResult
export const EmailIngestFilterResultSchema = z.enum(['PENDING', 'PASSED', 'SENDER_UNKNOWN', 'WRONG_TYPE', 'TOO_SMALL', 'TOO_LARGE', 'DUPLICATE', 'NOT_RATECON', 'BLOCKED_NAME'] as const);
export type EmailIngestFilterResult = z.infer<typeof EmailIngestFilterResultSchema>;
export const EmailIngestFilterResult = EmailIngestFilterResultSchema.enum;

// EmailIngestParseStatus
export const EmailIngestParseStatusSchema = z.enum(['PENDING', 'PARSING', 'PARSED', 'FAILED', 'SKIPPED'] as const);
export type EmailIngestParseStatus = z.infer<typeof EmailIngestParseStatusSchema>;
export const EmailIngestParseStatus = EmailIngestParseStatusSchema.enum;

// EmailIngestThreadStatus
export const EmailIngestThreadStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'DISCARDED', 'ARCHIVED'] as const);
export type EmailIngestThreadStatus = z.infer<typeof EmailIngestThreadStatusSchema>;
export const EmailIngestThreadStatus = EmailIngestThreadStatusSchema.enum;

// EmailUnknownSenderPolicy
export const EmailUnknownSenderPolicySchema = z.enum(['HOLD', 'PARSE_ANYWAY', 'REJECT'] as const);
export type EmailUnknownSenderPolicy = z.infer<typeof EmailUnknownSenderPolicySchema>;
export const EmailUnknownSenderPolicy = EmailUnknownSenderPolicySchema.enum;

// EquipmentType
export const EquipmentTypeSchema = z.enum(['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'POWER_ONLY', 'OTHER'] as const);
export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;
export const EquipmentType = EquipmentTypeSchema.enum;

// FactoringCompanyStatus
export const FactoringCompanyStatusSchema = z.enum(['ACTIVE', 'INACTIVE'] as const);
export type FactoringCompanyStatus = z.infer<typeof FactoringCompanyStatusSchema>;
export const FactoringCompanyStatus = FactoringCompanyStatusSchema.enum;

// FactoringContactRole
export const FactoringContactRoleSchema = z.enum(['PRIMARY', 'SUBMISSIONS', 'COLLECTIONS', 'NOA', 'OTHER'] as const);
export type FactoringContactRole = z.infer<typeof FactoringContactRoleSchema>;
export const FactoringContactRole = FactoringContactRoleSchema.enum;

// FactoringTxnType
export const FactoringTxnTypeSchema = z.enum(['ADVANCE', 'RESERVE_RELEASE', 'FEE', 'CHARGEBACK', 'CHARGEBACK_REVERSAL'] as const);
export type FactoringTxnType = z.infer<typeof FactoringTxnTypeSchema>;
export const FactoringTxnType = FactoringTxnTypeSchema.enum;

// FeedbackStatus
export const FeedbackStatusSchema = z.enum(['NEW', 'REVIEWED', 'RESOLVED'] as const);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;
export const FeedbackStatus = FeedbackStatusSchema.enum;

// FleetSize
export const FleetSizeSchema = z.enum(['SIZE_1_10', 'SIZE_11_50', 'SIZE_51_100', 'SIZE_101_500', 'SIZE_500_PLUS'] as const);
export type FleetSize = z.infer<typeof FleetSizeSchema>;
export const FleetSize = FleetSizeSchema.enum;

// IftaFuelSource
export const IftaFuelSourceSchema = z.enum(['MANUAL', 'FUEL_CARD', 'RECEIPT_SCAN', 'IMPORTED'] as const);
export type IftaFuelSource = z.infer<typeof IftaFuelSourceSchema>;
export const IftaFuelSource = IftaFuelSourceSchema.enum;

// IftaMileageSource
export const IftaMileageSourceSchema = z.enum(['LOAD_DERIVED', 'ROUTE_SEGMENT', 'MANUAL', 'ELD_GPS', 'IMPORTED'] as const);
export type IftaMileageSource = z.infer<typeof IftaMileageSourceSchema>;
export const IftaMileageSource = IftaMileageSourceSchema.enum;

// IftaQuarterStatus
export const IftaQuarterStatusSchema = z.enum(['OPEN', 'CALCULATING', 'DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED'] as const);
export type IftaQuarterStatus = z.infer<typeof IftaQuarterStatusSchema>;
export const IftaQuarterStatus = IftaQuarterStatusSchema.enum;

// IntegrationStatus
export const IntegrationStatusSchema = z.enum(['NOT_CONFIGURED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED', 'NEEDS_RECONNECT'] as const);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;
export const IntegrationStatus = IntegrationStatusSchema.enum;

// IntegrationType
export const IntegrationTypeSchema = z.enum(['TMS', 'ELD', 'ACCOUNTING', 'LOAD_BOARD'] as const);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;
export const IntegrationType = IntegrationTypeSchema.enum;

// IntegrationVendor
export const IntegrationVendorSchema = z.enum(['MCLEOD_TMS', 'TMW_TMS', 'PROJECT44_TMS', 'SAMSARA_ELD', 'MOTIVE_ELD', 'QUICKBOOKS', 'DAT_LOAD_BOARD'] as const);
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

// InvoiceStatus
export const InvoiceStatusSchema = z.enum(['DRAFT', 'SENT', 'VIEWED', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID', 'FACTORED', 'RECOURSED'] as const);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export const InvoiceStatus = InvoiceStatusSchema.enum;

// JobStatus
export const JobStatusSchema = z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const);
export type JobStatus = z.infer<typeof JobStatusSchema>;
export const JobStatus = JobStatusSchema.enum;

// LeadStatus
export const LeadStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DECLINED'] as const);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export const LeadStatus = LeadStatusSchema.enum;

// Lifecycle
export const LifecycleSchema = z.enum(['AVAILABLE', 'COMING_SOON'] as const);
export type Lifecycle = z.infer<typeof LifecycleSchema>;
export const Lifecycle = LifecycleSchema.enum;

// LineItemType
export const LineItemTypeSchema = z.enum(['LINEHAUL', 'FUEL_SURCHARGE', 'DETENTION_PICKUP', 'DETENTION_DELIVERY', 'LAYOVER', 'LUMPER', 'TONU', 'ACCESSORIAL', 'ADJUSTMENT'] as const);
export type LineItemType = z.infer<typeof LineItemTypeSchema>;
export const LineItemType = LineItemTypeSchema.enum;

// LoadBillingStatus
export const LoadBillingStatusSchema = z.enum(['PENDING_DOCUMENTS', 'READY_FOR_REVIEW', 'APPROVED', 'INVOICED', 'CLOSED'] as const);
export type LoadBillingStatus = z.infer<typeof LoadBillingStatusSchema>;
export const LoadBillingStatus = LoadBillingStatusSchema.enum;

// LoadLegStatus
export const LoadLegStatusSchema = z.enum(['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'ON_HOLD', 'DELIVERED', 'CANCELLED'] as const);
export type LoadLegStatus = z.infer<typeof LoadLegStatusSchema>;
export const LoadLegStatus = LoadLegStatusSchema.enum;

// LoadStatus
export const LoadStatusSchema = z.enum(['TENDER', 'DRAFT', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'ON_HOLD', 'DELIVERED', 'CANCELLED', 'TONU'] as const);
export type LoadStatus = z.infer<typeof LoadStatusSchema>;
export const LoadStatus = LoadStatusSchema.enum;

// LoadStopStatus
export const LoadStopStatusSchema = z.enum(['PENDING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const);
export type LoadStopStatus = z.infer<typeof LoadStopStatusSchema>;
export const LoadStopStatus = LoadStopStatusSchema.enum;

// LocationPrecision
export const LocationPrecisionSchema = z.enum(['ROOFTOP', 'CENTROID', 'UNKNOWN'] as const);
export type LocationPrecision = z.infer<typeof LocationPrecisionSchema>;
export const LocationPrecision = LocationPrecisionSchema.enum;

// LocationType
export const LocationTypeSchema = z.enum(['WAREHOUSE', 'DISTRIBUTION_CENTER', 'TRUCK_STOP', 'FUEL_STATION', 'REST_AREA', 'PORT', 'RAIL_YARD', 'OTHER'] as const);
export type LocationType = z.infer<typeof LocationTypeSchema>;
export const LocationType = LocationTypeSchema.enum;

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

// MoneyCodeMethod
export const MoneyCodeMethodSchema = z.enum(['COMCHEK', 'EFS', 'CASH'] as const);
export type MoneyCodeMethod = z.infer<typeof MoneyCodeMethodSchema>;
export const MoneyCodeMethod = MoneyCodeMethodSchema.enum;

// MoneyCodeStatus
export const MoneyCodeStatusSchema = z.enum(['REQUESTED', 'APPROVED', 'DENIED', 'USED', 'EXPIRED', 'CANCELLED'] as const);
export type MoneyCodeStatus = z.infer<typeof MoneyCodeStatusSchema>;
export const MoneyCodeStatus = MoneyCodeStatusSchema.enum;

// NoaStatus
export const NoaStatusSchema = z.enum(['NOT_SENT', 'SENT', 'ACKNOWLEDGED', 'REJECTED'] as const);
export type NoaStatus = z.infer<typeof NoaStatusSchema>;
export const NoaStatus = NoaStatusSchema.enum;

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
export const NotificationTypeSchema = z.enum(['USER_INVITATION', 'TENANT_REGISTRATION_CONFIRMATION', 'TENANT_APPROVED', 'TENANT_REJECTED', 'INTEGRATION_SYNC_COMPLETED', 'INTEGRATION_SYNC_FAILED', 'SHIELD_AUDIT_CRITICAL', 'SETTINGS_UPDATED', 'USER_JOINED', 'ROLE_CHANGED', 'DRIVER_ACTIVATED', 'DRIVER_DEACTIVATED', 'INVOICE_GENERATED', 'INVOICE_SENT', 'INVOICE_OVERDUE', 'PAYMENT_RECEIVED', 'CUSTOMER_INVOICE_SENT', 'CUSTOMER_PAYMENT_CONFIRMED', 'SETTLEMENT_READY', 'DRIVER_PAYMENT_PROCESSED', 'DOCUMENT_EXPIRING_SOON', 'EMAIL_RATECON_PARSED'] as const);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export const NotificationType = NotificationTypeSchema.enum;

// OwnershipType
export const OwnershipTypeSchema = z.enum(['OWNED', 'LEASED', 'OWNER_OPERATOR'] as const);
export type OwnershipType = z.infer<typeof OwnershipTypeSchema>;
export const OwnershipType = OwnershipTypeSchema.enum;

// PaymentMethodType
export const PaymentMethodTypeSchema = z.enum(['CARD', 'US_BANK_ACCOUNT'] as const);
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>;
export const PaymentMethodType = PaymentMethodTypeSchema.enum;

// PaymentTerms
export const PaymentTermsSchema = z.enum(['NET_15', 'NET_30', 'NET_45', 'NET_60', 'NET_90', 'COD', 'QUICK_PAY'] as const);
export type PaymentTerms = z.infer<typeof PaymentTermsSchema>;
export const PaymentTerms = PaymentTermsSchema.enum;

// PayStructureType
export const PayStructureTypeSchema = z.enum(['PER_MILE', 'PERCENTAGE', 'FLAT_RATE', 'HYBRID'] as const);
export type PayStructureType = z.infer<typeof PayStructureTypeSchema>;
export const PayStructureType = PayStructureTypeSchema.enum;

// Priority
export const PrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const);
export type Priority = z.infer<typeof PrioritySchema>;
export const Priority = PrioritySchema.enum;

// RecourseType
export const RecourseTypeSchema = z.enum(['RECOURSE', 'NON_RECOURSE'] as const);
export type RecourseType = z.infer<typeof RecourseTypeSchema>;
export const RecourseType = RecourseTypeSchema.enum;

// RecurringLaneStatus
export const RecurringLaneStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'] as const);
export type RecurringLaneStatus = z.infer<typeof RecurringLaneStatusSchema>;
export const RecurringLaneStatus = RecurringLaneStatusSchema.enum;

// RoutePlanStatus
export const RoutePlanStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'CANCELLED', 'SUPERSEDED', 'COMPLETED'] as const);
export type RoutePlanStatus = z.infer<typeof RoutePlanStatusSchema>;
export const RoutePlanStatus = RoutePlanStatusSchema.enum;

// RouteSegmentStatus
export const RouteSegmentStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'] as const);
export type RouteSegmentStatus = z.infer<typeof RouteSegmentStatusSchema>;
export const RouteSegmentStatus = RouteSegmentStatusSchema.enum;

// SettlementStatus
export const SettlementStatusSchema = z.enum(['DRAFT', 'APPROVED', 'PAID', 'VOID'] as const);
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;
export const SettlementStatus = SettlementStatusSchema.enum;

// ShieldAuditScope
export const ShieldAuditScopeSchema = z.enum(['FULL', 'HOS', 'DRIVERS', 'VEHICLES', 'LOADS'] as const);
export type ShieldAuditScope = z.infer<typeof ShieldAuditScopeSchema>;
export const ShieldAuditScope = ShieldAuditScopeSchema.enum;

// ShieldAuditStatus
export const ShieldAuditStatusSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const);
export type ShieldAuditStatus = z.infer<typeof ShieldAuditStatusSchema>;
export const ShieldAuditStatus = ShieldAuditStatusSchema.enum;

// ShieldFindingCategory
export const ShieldFindingCategorySchema = z.enum(['HOS', 'DRIVERS', 'VEHICLES', 'LOADS'] as const);
export type ShieldFindingCategory = z.infer<typeof ShieldFindingCategorySchema>;
export const ShieldFindingCategory = ShieldFindingCategorySchema.enum;

// ShieldFindingSeverity
export const ShieldFindingSeveritySchema = z.enum(['CRITICAL', 'WARNING', 'INFO', 'PASSED'] as const);
export type ShieldFindingSeverity = z.infer<typeof ShieldFindingSeveritySchema>;
export const ShieldFindingSeverity = ShieldFindingSeveritySchema.enum;

// ShieldStatusLabel
export const ShieldStatusLabelSchema = z.enum(['PROTECTED', 'AT_RISK', 'VULNERABLE'] as const);
export type ShieldStatusLabel = z.infer<typeof ShieldStatusLabelSchema>;
export const ShieldStatusLabel = ShieldStatusLabelSchema.enum;

// StopEntryPolicy
export const StopEntryPolicySchema = z.enum(['FCFS', 'APPOINTMENT_STRICT', 'LOOSE'] as const);
export type StopEntryPolicy = z.infer<typeof StopEntryPolicySchema>;
export const StopEntryPolicy = StopEntryPolicySchema.enum;

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

// SyncStatus
export const SyncStatusSchema = z.enum(['SYNCED', 'REMOVED', 'SYNC_ERROR', 'MANUAL_ENTRY'] as const);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
export const SyncStatus = SyncStatusSchema.enum;

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

// TrailerLifecycleStatus
export const TrailerLifecycleStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED'] as const);
export type TrailerLifecycleStatus = z.infer<typeof TrailerLifecycleStatusSchema>;
export const TrailerLifecycleStatus = TrailerLifecycleStatusSchema.enum;

// TrailerStatus
export const TrailerStatusSchema = z.enum(['AVAILABLE', 'ASSIGNED', 'AT_SHIPPER', 'AT_RECEIVER', 'IN_SHOP', 'OUT_OF_SERVICE'] as const);
export type TrailerStatus = z.infer<typeof TrailerStatusSchema>;
export const TrailerStatus = TrailerStatusSchema.enum;

// TriggerKind
export const TriggerKindSchema = z.enum(['SCHEDULED', 'DOMAIN_EVENT', 'WEBHOOK', 'MANUAL'] as const);
export type TriggerKind = z.infer<typeof TriggerKindSchema>;
export const TriggerKind = TriggerKindSchema.enum;

// TripStatus
export const TripStatusSchema = z.enum(['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const);
export type TripStatus = z.infer<typeof TripStatusSchema>;
export const TripStatus = TripStatusSchema.enum;

// TrustLevel
export const TrustLevelSchema = z.enum(['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'] as const);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;
export const TrustLevel = TrustLevelSchema.enum;

// UserRole
export const UserRoleSchema = z.enum(['DISPATCHER', 'DRIVER', 'ADMIN', 'OWNER', 'CUSTOMER', 'SUPER_ADMIN'] as const);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const UserRole = UserRoleSchema.enum;

// VehicleLifecycleStatus
export const VehicleLifecycleStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED'] as const);
export type VehicleLifecycleStatus = z.infer<typeof VehicleLifecycleStatusSchema>;
export const VehicleLifecycleStatus = VehicleLifecycleStatusSchema.enum;

// VehicleStatus
export const VehicleStatusSchema = z.enum(['AVAILABLE', 'ASSIGNED', 'IN_SHOP', 'OUT_OF_SERVICE'] as const);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;
export const VehicleStatus = VehicleStatusSchema.enum;

// VehicleUnavailabilityType
export const VehicleUnavailabilityTypeSchema = z.enum(['MAINTENANCE', 'INSPECTION', 'REPAIR', 'OUT_OF_SERVICE', 'OTHER'] as const);
export type VehicleUnavailabilityType = z.infer<typeof VehicleUnavailabilityTypeSchema>;
export const VehicleUnavailabilityType = VehicleUnavailabilityTypeSchema.enum;

// WalletTransactionType
export const WalletTransactionTypeSchema = z.enum(['TOP_UP', 'OVERAGE_DEDUCTION', 'ADMIN_CREDIT', 'REFUND', 'AUTO_RELOAD'] as const);
export type WalletTransactionType = z.infer<typeof WalletTransactionTypeSchema>;
export const WalletTransactionType = WalletTransactionTypeSchema.enum;

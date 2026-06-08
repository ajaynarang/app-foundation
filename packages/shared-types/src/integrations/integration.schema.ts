import { z } from 'zod';
import {
  IntegrationStatus,
  IntegrationStatusSchema,
  IntegrationType,
  IntegrationTypeSchema,
  IntegrationVendor,
  IntegrationVendorSchema,
} from '../generated/prisma-enums';

// `IntegrationType`, `IntegrationVendor`, and `IntegrationStatus` are re-exported
// from the codegen mirror — the Prisma enums are the single source of truth.
export {
  IntegrationStatus,
  IntegrationStatusSchema,
  IntegrationType,
  IntegrationTypeSchema,
  IntegrationVendor,
  IntegrationVendorSchema,
};

export const CreateIntegrationInputSchema = z.object({
  integrationType: IntegrationTypeSchema,
  vendor: IntegrationVendorSchema,
  displayName: z.string(),
  credentials: z.record(z.string(), z.any()).optional(),
});

export const UpdateIntegrationInputSchema = z.object({
  displayName: z.string().optional(),
  credentials: z.record(z.string(), z.any()).optional(),
  isEnabled: z.boolean().optional(),
});

export const AccountingStatusSchema = z.object({
  connected: z.boolean(),
  vendor: z.string().optional(),
  companyName: z.string().optional(),
  realmId: z.string().optional(),
  lastSyncedAt: z.string().optional(),
});

export const EntityMappingSchema = z.object({
  id: z.number(),
  entityType: z.enum(['customer', 'vendor', 'class']),
  sallyEntityId: z.string(),
  sallyEntityName: z.string(),
  sallyEntityType: z.string(),
  externalId: z.string(),
  externalName: z.string(),
  matchConfidence: z.number().nullable(),
  confirmedAt: z.string().nullable(),
});

export const ExternalEntitySchema = z.object({
  externalId: z.string(),
  externalName: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

export const AccountMappingSchema = z.object({
  id: z.number(),
  sallyItemType: z.string(),
  direction: z.enum(['INCOME', 'EXPENSE']),
  externalAccountId: z.string(),
  externalAccountName: z.string(),
  isDefault: z.boolean(),
});

export const SyncJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal('queued'),
});

// IntegrationStatusSchema is re-exported above from the codegen mirror.

export const CredentialFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'password', 'url', 'number']),
  required: z.boolean(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
});

export const OAuthConfigResponseSchema = z.object({
  authorizationUrl: z.string(),
  tokenUrl: z.string(),
  revokeUrl: z.string().optional(),
  scopes: z.array(z.string()),
  tokenExpirySeconds: z.number(),
  callbackQueryParams: z.array(z.string()).optional(),
});

export const OAuthConnectionMethodSchema = z.object({
  type: z.literal('oauth'),
  config: OAuthConfigResponseSchema,
});

export const CredentialsConnectionMethodSchema = z.object({
  type: z.literal('credentials'),
  label: z.string().optional(),
  fields: z.array(CredentialFieldSchema),
});

export const FileUploadConnectionMethodSchema = z.object({
  type: z.literal('file_upload'),
  acceptedFormats: z.array(z.enum(['csv', 'xlsx'])),
});

export const ConnectionMethodSchema = z.discriminatedUnion('type', [
  OAuthConnectionMethodSchema,
  CredentialsConnectionMethodSchema,
  FileUploadConnectionMethodSchema,
]);

export const VendorMetadataSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  integrationType: IntegrationTypeSchema,
  connectionMethods: z.array(ConnectionMethodSchema),
  helpUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  displayOrder: z.number().optional(),
});

export const IntegrationConfigSchema = z.object({
  id: z.string(),
  integrationType: IntegrationTypeSchema,
  vendor: z.string(),
  displayName: z.string(),
  isEnabled: z.boolean(),
  status: IntegrationStatusSchema,
  lastSyncAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  lastErrorAt: z.string().optional(),
  lastErrorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SyncResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  jobIds: z.array(z.string()).optional(),
});

export const SyncStatsSchema = z.object({
  totalSyncs: z.number(),
  successfulSyncs: z.number(),
  failedSyncs: z.number(),
  successRate: z.number(),
});

export const IntegrationHealthItemSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  displayName: z.string(),
  isEnabled: z.boolean(),
  status: z.string(),
  lastSyncAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  hasError: z.boolean(),
  lastErrorMessage: z.string().nullable(),
});

export const IntegrationHealthSummarySchema = z.object({
  hasIntegrations: z.boolean(),
  hasFleetPipeline: z.boolean(),
  tms: IntegrationHealthItemSchema.nullable(),
  eld: IntegrationHealthItemSchema.nullable(),
  activeSyncs: z.array(
    z.object({
      type: z.string(),
      vendor: z.string(),
      syncType: z.string(),
      startedAt: z.string(),
    }),
  ),
  configuredTypes: z.array(z.string()),
  dataFeeds: z.array(IntegrationHealthItemSchema),
  unmatchedAssets: z.number(),
  lastSyncByType: z.record(z.string(), z.string().nullable()),
});

export const UnifiedSyncLogSchema = z.object({
  // Numeric Job PK — this row is built from a `jobs` table record (Int PK).
  id: z.number(),
  syncType: z.string(),
  triggerSource: z.string(),
  status: z.enum(['running', 'success', 'failed']),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  recordsProcessed: z.number(),
  recordsCreated: z.number(),
  recordsUpdated: z.number(),
  errorDetails: z.record(z.string(), z.any()).optional(),
  vendor: z.string(),
  integrationType: z.string(),
  displayName: z.string(),
});

export const UnifiedSyncHistoryResponseSchema = z.object({
  items: z.array(UnifiedSyncLogSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  details: z.record(z.string(), z.any()).optional(),
});

// Inferred types
// `IntegrationType`, `IntegrationVendor`, `IntegrationStatus` types come from
// the generated mirror via the re-export at the top of this file.
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationInputSchema>;
export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationInputSchema>;
export type AccountingStatus = z.infer<typeof AccountingStatusSchema>;
export type EntityMapping = z.infer<typeof EntityMappingSchema>;
export type ExternalEntity = z.infer<typeof ExternalEntitySchema>;
export type AccountMapping = z.infer<typeof AccountMappingSchema>;
export type SyncJobResponse = z.infer<typeof SyncJobResponseSchema>;
export type CredentialField = z.infer<typeof CredentialFieldSchema>;
export type OAuthConfigResponse = z.infer<typeof OAuthConfigResponseSchema>;
export type ConnectionMethod = z.infer<typeof ConnectionMethodSchema>;
export type VendorMetadata = z.infer<typeof VendorMetadataSchema>;
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type SyncStats = z.infer<typeof SyncStatsSchema>;
export type IntegrationHealthItem = z.infer<typeof IntegrationHealthItemSchema>;
export type IntegrationHealthSummary = z.infer<typeof IntegrationHealthSummarySchema>;
export type UnifiedSyncLog = z.infer<typeof UnifiedSyncLogSchema>;
export type UnifiedSyncHistoryResponse = z.infer<typeof UnifiedSyncHistoryResponseSchema>;
export type TestConnectionResponse = z.infer<typeof TestConnectionResponseSchema>;

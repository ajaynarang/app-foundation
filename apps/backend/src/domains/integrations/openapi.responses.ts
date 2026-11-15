/**
 * Integrations response schemas for the published contract: the generic integrations framework and the vendor
 * OAuth connect.
 */
import { z } from 'zod';
import { IntegrationStatusSchema, IntegrationTypeSchema, IntegrationVendorSchema } from '@app/shared-types';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

const iso = () => z.string().describe('ISO-8601 timestamp');

// ─── Generic integrations (`/integrations`) ─────────────────────────────────

/** `GET /integrations` row and `GET /integrations/:integration_id` — never credential material. */
export const IntegrationResponse = defineResponseSchema(
  'Integration',
  z.object({
    id: z.string().describe('Integration public id (int_…)'),
    integrationType: IntegrationTypeSchema,
    vendor: IntegrationVendorSchema,
    displayName: z.string(),
    isEnabled: z.boolean(),
    status: IntegrationStatusSchema,
    lastSyncAt: iso().optional().describe('Absent until the first sync'),
    lastSuccessAt: iso().optional(),
    lastErrorAt: iso().optional(),
    lastErrorMessage: z.string().nullable(),
    createdAt: iso(),
    updatedAt: iso(),
  }),
);

export const IntegrationCreatedResponse = defineResponseSchema(
  'IntegrationCreated',
  z.object({
    id: z.string().describe('Integration public id (int_…)'),
    integrationType: IntegrationTypeSchema,
    vendor: IntegrationVendorSchema,
    displayName: z.string(),
    isEnabled: z.boolean(),
    status: IntegrationStatusSchema,
    createdAt: iso(),
    updatedAt: iso(),
  }),
);

export const IntegrationUpdatedResponse = defineResponseSchema(
  'IntegrationUpdated',
  z.object({
    id: z.string().describe('Integration public id (int_…)'),
    integrationType: IntegrationTypeSchema,
    vendor: IntegrationVendorSchema,
    displayName: z.string(),
    isEnabled: z.boolean(),
    status: IntegrationStatusSchema,
    updatedAt: iso(),
  }),
);

const CredentialFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'password', 'url', 'number']),
  required: z.boolean(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
});

/** The vendor's OAuth config as published — the env-var prefix is stripped. */
const PublicOAuthConfigSchema = z.object({
  authorizationUrl: z.string(),
  tokenUrl: z.string(),
  revokeUrl: z.string().optional(),
  scopes: z.array(z.string()),
  tokenExpirySeconds: z.number().int().describe('0 = the vendor’s tokens never expire'),
  extraAuthParams: z.record(z.string(), z.string()).optional(),
  callbackQueryParams: z.array(z.string()).optional(),
  tokenAuthStyle: z.enum(['basic', 'body']).optional(),
  scopeSeparator: z.string().optional(),
});

const ConnectionMethodSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('oauth'), config: PublicOAuthConfigSchema }),
  z.object({ type: z.literal('credentials'), label: z.string().optional(), fields: z.array(CredentialFieldSchema) }),
  z.object({ type: z.literal('file_upload'), acceptedFormats: z.array(z.enum(['csv', 'xlsx'])) }),
]);

/** One `VENDOR_REGISTRY` entry merged with its runtime `VendorConfig` (`GET /integrations/vendors`). */
export const IntegrationVendorEntryResponse = defineResponseSchema(
  'IntegrationVendorEntry',
  z.object({
    id: z.string(),
    connectVia: z.literal('dedicated').optional().describe('Connected from its own page, not POST /integrations'),
    displayName: z.string(),
    description: z.string(),
    integrationType: IntegrationTypeSchema,
    connectionMethods: z.array(ConnectionMethodSchema),
    helpUrl: z.string().optional(),
    logoUrl: z.string().optional(),
    displayOrder: z.number().int(),
  }),
);

export const IntegrationHealthSummaryResponse = defineResponseSchema(
  'IntegrationHealthSummary',
  z.object({
    hasIntegrations: z.boolean(),
    activeSyncs: z
      .array(
        z.object({
          type: z.string().describe('Integration type from the job input, or UNKNOWN'),
          vendor: z.string().describe('Integration name from the job input, or UNKNOWN'),
          syncType: z.string(),
          startedAt: iso(),
        }),
      )
      .describe('Sync jobs queued or running in the last 10 minutes'),
    configuredTypes: z.array(IntegrationTypeSchema),
    integrations: z.array(
      z.object({
        id: z.string().describe('Integration public id (int_…)'),
        vendor: IntegrationVendorSchema,
        displayName: z.string(),
        isEnabled: z.boolean(),
        status: IntegrationStatusSchema,
        lastSyncAt: iso().nullable(),
        lastSuccessAt: iso().nullable(),
        hasError: z.boolean().describe('The last error is newer than the last success'),
        lastErrorMessage: z.string().nullable(),
      }),
    ),
    lastSyncByType: z.record(z.string(), iso().nullable()).describe('Last completed sync per (upper-cased) job type'),
  }),
);

export const IntegrationConnectionTestResponse = defineResponseSchema(
  'IntegrationConnectionTest',
  z.object({ success: z.boolean(), message: z.string() }),
);

export const IntegrationSyncQueuedResponse = defineResponseSchema(
  'IntegrationSyncQueued',
  z.object({
    jobId: z.string().describe('The sync job’s public id — poll the job or the sync history'),
    status: z.literal('QUEUED'),
  }),
);

/** One sync run (a job) as the sync-history lists show it. */
const SyncHistoryItemSchema = z.object({
  id: z.string().describe('The job’s public id'),
  syncType: z.string(),
  triggerSource: z.string().describe('manual · auto · scheduled'),
  status: z.string().describe('running · success · failed (any other job status passes through)'),
  startedAt: iso(),
  completedAt: iso().nullable(),
  durationMs: z.number().int().nullable(),
  recordsProcessed: z.number().int(),
  recordsCreated: z.number().int(),
  recordsUpdated: z.number().int(),
  errorDetails: z.record(z.string(), z.unknown()).nullable(),
  vendor: z.string(),
  integrationType: z.string(),
  displayName: z.string(),
});

export const IntegrationSyncHistoryListResponse = defineCursorListSchema(
  'IntegrationSyncHistoryList',
  SyncHistoryItemSchema,
);

export const IntegrationSyncStatsResponse = defineResponseSchema(
  'IntegrationSyncStats',
  z.object({
    totalSyncs: z.number().int(),
    successfulSyncs: z.number().int(),
    failedSyncs: z.number().int(),
    successRate: z.number().describe('Percent of syncs that completed (0 when none)'),
  }),
);

// ─── Vendor OAuth ────────────────────────────────────────────────────────────

export const IntegrationOAuthConnectResponse = defineResponseSchema(
  'IntegrationOAuthConnect',
  z.object({ authUrl: z.string().describe('The vendor authorization URL to send the browser to') }),
);

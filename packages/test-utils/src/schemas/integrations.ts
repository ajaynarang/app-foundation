/**
 * API Contracts for the integrations framework endpoints.
 *
 * All schemas are hand-written under `.strict()` — shared-types ships no
 * integration schemas today (verified: no `integrations/` folder in
 * `packages/shared-types/src/`).
 *
 * Each schema is annotated with the consuming endpoint(s). The Prisma row
 * projection differs from the model definition (e.g. `id` is the STRING
 * integrationId; the numeric DB id is NOT exposed; `lastErrorMessage` can
 * be omitted on PATCH responses but surfaces as `null` on GET / CREATE).
 *
 * Schemas:
 *   - IntegrationRowSchema, IntegrationListSchema, IntegrationCreateResponseSchema,
 *     IntegrationUpdateResponseSchema — /integrations CRUD.
 *   - VendorRegistrySchema — /integrations/vendors (the vendor registry
 *     ships EMPTY in this starter — add your connectors).
 *   - IntegrationHealthResponseSchema — /integrations/health.
 *   - SyncHistoryEntrySchema, SyncHistoryListResponseSchema,
 *     SyncHistoryArraySchema — unified list vs per-integration list.
 *   - SyncStatsSchema — per-integration stats.
 *   - TestConnectionResponseSchema, SyncTriggerResponseSchema,
 *     DeleteIntegrationResponseSchema — action endpoints.
 *   - OAuthConnectResponseSchema, OAuthDisconnectResponseSchema — consumer
 *     OAuth.
 */
import { z } from 'zod';
import { isoDateString, stringId } from './helpers.js';

// ── INTEGRATION ROW (CRUD projections) ───────────────────────────────

/**
 * Integration row as returned by GET /integrations/:id and GET /integrations
 * list elements. Also covers POST /integrations (create) minus a few
 * optional fields, and PATCH /integrations/:id (update) which trims
 * `createdAt` and `lastErrorMessage`.
 *
 * The row's string primary key is `id` (= integrationConfig.integrationId
 * column) — NOT `integrationId`. Numeric DB id is not exposed.
 *
 * Observed field set on GET /integrations (projection from
 * integrations.service.ts::listIntegrations):
 *   id, integrationType, vendor, displayName, isEnabled, status,
 *   lastSyncAt?, lastSuccessAt?, lastErrorAt?, lastErrorMessage?,
 *   createdAt, updatedAt
 *
 * NestJS strips `undefined` — `?.toISOString()` on a null column
 * omits the key. So we model timestamp fields as `.optional()`,
 * and `lastErrorMessage` is observed as either absent (fresh row)
 * OR `null` (GET single). Model as optional + nullable.
 */
export const IntegrationRowSchema = z
  .object({
    id: stringId,
    integrationType: z.string(),
    vendor: z.string(),
    displayName: z.string(),
    isEnabled: z.boolean(),
    status: z.string(),
    lastSyncAt: isoDateString.optional(),
    lastSuccessAt: isoDateString.optional(),
    lastErrorAt: isoDateString.optional(),
    lastErrorMessage: z.string().nullable().optional(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

export const IntegrationListSchema = z.array(IntegrationRowSchema);

/**
 * POST /integrations response — a fresh row has no sync history yet,
 * so `lastSyncAt`/`lastSuccessAt`/`lastErrorAt`/`lastErrorMessage`
 * are all absent from the projection (integrations.service.ts lines
 * 342–351 — the create return does not spread them).
 */
export const IntegrationCreateResponseSchema = z
  .object({
    id: stringId,
    integrationType: z.string(),
    vendor: z.string(),
    displayName: z.string(),
    isEnabled: z.boolean(),
    status: z.string(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

/**
 * PATCH /integrations/:id response — drops `createdAt` (service update
 * return only projects `updatedAt`, see integrations.service.ts lines
 * 386–394).
 */
export const IntegrationUpdateResponseSchema = z
  .object({
    id: stringId,
    integrationType: z.string(),
    vendor: z.string(),
    displayName: z.string(),
    isEnabled: z.boolean(),
    status: z.string(),
    updatedAt: isoDateString,
  })
  .strict();

/** DELETE /integrations/:id — `{success: true}` (200, not 204). */
export const DeleteIntegrationResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .strict();

// ── VENDOR REGISTRY (/integrations/vendors) ───────────────────────────

/** Credential-method field descriptor (registry line 3–10). */
const VendorCredentialFieldSchema = z
  .object({
    name: z.string(),
    label: z.string(),
    type: z.enum(['text', 'password', 'url', 'number']),
    required: z.boolean(),
    helpText: z.string().optional(),
    placeholder: z.string().optional(),
  })
  .strict();

/**
 * OAuth connection-method config — note envPrefix is STRIPPED by
 * integrations.service.ts::getVendorRegistry so it does NOT surface
 * here (security — service line 51).
 */
const VendorOAuthMethodSchema = z
  .object({
    type: z.literal('oauth'),
    config: z
      .object({
        authorizationUrl: z.string(),
        tokenUrl: z.string(),
        revokeUrl: z.string().optional(),
        scopes: z.array(z.string()),
        tokenExpirySeconds: z.number(),
        extraAuthParams: z.record(z.string(), z.string()).optional(),
        callbackQueryParams: z.array(z.string()).optional(),
      })
      .strict(),
  })
  .strict();

const VendorCredentialsMethodSchema = z
  .object({
    type: z.literal('credentials'),
    label: z.string().optional(),
    fields: z.array(VendorCredentialFieldSchema),
  })
  .strict();

const VendorFileUploadMethodSchema = z
  .object({
    type: z.literal('file_upload'),
    acceptedFormats: z.array(z.enum(['csv', 'xlsx'])),
  })
  .strict();

const VendorConnectionMethodSchema = z.discriminatedUnion('type', [
  VendorOAuthMethodSchema,
  VendorCredentialsMethodSchema,
  VendorFileUploadMethodSchema,
]);

/**
 * Single vendor-registry entry as returned by GET /integrations/vendors.
 * `displayOrder` is added by the service merge step (line 63).
 */
const VendorRegistryEntrySchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    description: z.string(),
    integrationType: z.string(),
    connectionMethods: z.array(VendorConnectionMethodSchema),
    helpUrl: z.string().optional(),
    logoUrl: z.string().optional(),
    displayOrder: z.number(),
  })
  .strict();

/**
 * GET /integrations/vendors — the service returns a FLAT ARRAY of
 * registry entries (integrations.service.ts line 37 returns
 * `Object.values(...).map(...).filter(Boolean).sort(...)`), NOT a
 * Record/map keyed by vendorId.
 */
export const VendorRegistrySchema = z.array(VendorRegistryEntrySchema);

// ── HEALTH SUMMARY (/integrations/health) ─────────────────────────────

/**
 * Per-integration block used inside HealthResponse.
 * integrations.service.ts::formatIntegration.
 */
const HealthIntegrationBlockSchema = z
  .object({
    id: stringId,
    vendor: z.string(),
    displayName: z.string(),
    isEnabled: z.boolean(),
    status: z.string(),
    lastSyncAt: isoDateString.nullable(),
    lastSuccessAt: isoDateString.nullable(),
    hasError: z.boolean(),
    lastErrorMessage: z.string().nullable(),
  })
  .strict();

/** activeSyncs[] element — integrations.service.ts lines 144–148. */
const ActiveSyncSchema = z
  .object({
    type: z.string(),
    vendor: z.string(),
    syncType: z.string().optional(),
    startedAt: isoDateString,
  })
  .strict();

/**
 * GET /integrations/health response (integrations.service.ts
 * ::getHealthSummary).
 *
 * `lastSyncByType` is a map keyed by uppercase sync-job type → ISO string
 * or null. Zod's `z.record()` with a value type + nullable is the right
 * shape — the keys are dynamic.
 */
export const IntegrationHealthResponseSchema = z
  .object({
    hasIntegrations: z.boolean(),
    activeSyncs: z.array(ActiveSyncSchema),
    configuredTypes: z.array(z.string()),
    integrations: z.array(HealthIntegrationBlockSchema),
    lastSyncByType: z.record(z.string(), isoDateString.nullable()),
  })
  .strict();

// ── SYNC HISTORY ─────────────────────────────────────────────────────

/**
 * Single sync-history item as formatted by
 * integrations.service.ts::mapJobToSyncHistoryItem (lines 549–579).
 */
export const SyncHistoryEntrySchema = z
  .object({
    id: stringId,
    syncType: z.string(),
    triggerSource: z.string(),
    status: z.string(),
    startedAt: isoDateString.optional(),
    completedAt: isoDateString.nullable(),
    durationMs: z.number().nullable(),
    recordsProcessed: z.number(),
    recordsCreated: z.number(),
    recordsUpdated: z.number(),
    errorDetails: z
      .object({
        message: z.string().optional(),
        stack: z.string().optional(),
        attempt: z.number().optional(),
        nonRetryable: z.boolean().optional(),
      })
      .passthrough()
      .nullable(),
    vendor: z.string(),
    integrationType: z.string(),
    displayName: z.string(),
  })
  .strict();

/**
 * GET /integrations/sync-history (UNIFIED — no :id) returns a paged
 * envelope `{items, total, limit, offset}` — integrations.service.ts
 * ::getUnifiedSyncHistory lines 532–542.
 */
export const SyncHistoryListResponseSchema = z
  .object({
    items: z.array(SyncHistoryEntrySchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
  .strict();

/**
 * GET /integrations/:id/sync-history (PER-INTEGRATION) returns a FLAT
 * ARRAY (integrations.service.ts::getSyncHistory line 442 —
 * `return jobs.map(...)`).
 */
export const SyncHistoryArraySchema = z.array(SyncHistoryEntrySchema);

/**
 * GET /integrations/:id/sync-history/stats — integrations.service.ts
 * ::getSyncStats lines 471–476.
 */
export const SyncStatsSchema = z
  .object({
    totalSyncs: z.number(),
    successfulSyncs: z.number(),
    failedSyncs: z.number(),
    successRate: z.number(),
  })
  .strict();

// ── ACTION ENDPOINTS ─────────────────────────────────────────────────

/** POST /integrations/:id/test — integrations.service.ts lines 414–417. */
export const TestConnectionResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .strict();

/**
 * POST /integrations/:id/sync. On the concurrent-sync guard branch the
 * response is `{success: false, message}` with NO jobIds. Model as a
 * discriminated union to cover both branches.
 */
export const SyncTriggerResponseSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      message: z.string(),
      jobIds: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      message: z.string(),
    })
    .strict(),
]);

// ── OAUTH CONSUMER ────────────────────────────────────────────────────

/**
 * GET /integrations/oauth/:vendor/connect — auth-token.service.ts
 * ::getConnectUrl returns `{authUrl}` (line 58), NOT `{url}`.
 */
export const OAuthConnectResponseSchema = z
  .object({
    authUrl: z.string(),
  })
  .strict();

/**
 * POST /integrations/oauth/:vendor/disconnect — oauth.controller.ts
 * line 119 returns `{success: boolean, message: string}`.
 */
export const OAuthDisconnectResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .strict();

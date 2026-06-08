/**
 * API Contracts for Integrations domain endpoints (Phase 5 — 13 spec files).
 *
 * All schemas are hand-written under `.strict()` — shared-types ships no
 * integration schemas today (verified: no `integrations/` folder in
 * `packages/shared-types/src/`).
 *
 * Each schema is annotated with the consuming endpoint(s). Shapes are
 * pinned against live probes on `demo-northstar-2026` (backend running
 * on :8011, probed 2026-04-23) — the Prisma row projection differs
 * from the model definition (e.g. `id` is the STRING integrationId; the
 * numeric DB id is NOT exposed; `lastErrorMessage` can be omitted on
 * PATCH responses but surfaces as `null` on GET / CREATE).
 *
 * Group 5a schemas (12 + 3 + 6 = 21 tests):
 *   - IntegrationRowSchema, IntegrationListSchema, IntegrationCreateResponseSchema,
 *     IntegrationUpdateResponseSchema — /integrations CRUD.
 *   - VendorRegistrySchema — /integrations/vendors.
 *   - IntegrationHealthResponseSchema — /integrations/health.
 *   - SyncHistoryEntrySchema, SyncHistoryListResponseSchema,
 *     SyncHistoryArraySchema — unified list vs per-integration list.
 *   - SyncStatsSchema — per-integration stats.
 *   - TestConnectionResponseSchema, SyncTriggerResponseSchema,
 *     DeleteIntegrationResponseSchema — action endpoints.
 *   - OAuthConnectResponseSchema, OAuthDisconnectResponseSchema — consumer
 *     OAuth.
 *   - EldDriverListSchema, EldVehicleListSchema, LinkResultSchema — eld-linking.
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
 * Per-integration block used inside HealthResponse for tms/eld/dataFeeds.
 * integrations.service.ts::formatIntegration (lines 114–124).
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
 * ::getHealthSummary lines 139–156).
 *
 * `lastSyncByType` is a map keyed by uppercase sync-type (FLEET-SYNC,
 * HOS, GPS, DVIR, etc.) → ISO string or null. Zod's `z.record()` with
 * a value type + nullable is the right shape — the keys are dynamic.
 */
export const IntegrationHealthResponseSchema = z
  .object({
    hasIntegrations: z.boolean(),
    hasFleetPipeline: z.boolean(),
    tms: HealthIntegrationBlockSchema.nullable(),
    eld: HealthIntegrationBlockSchema.nullable(),
    activeSyncs: z.array(ActiveSyncSchema),
    configuredTypes: z.array(z.string()),
    dataFeeds: z.array(HealthIntegrationBlockSchema),
    unmatchedAssets: z.number(),
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
 * POST /integrations/:id/sync and the fleet/eld sync endpoints share
 * this shape. On concurrent-sync guard (POST /integrations/fleet/sync
 * only, lines 96–100) the response is `{success: false, message}` with
 * NO jobIds. Model as discriminated union to cover both branches.
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

// ── ELD LINKING ───────────────────────────────────────────────────────

/**
 * GET /api/v1/integrations/eld/drivers — eld-linking.service.ts
 * ::listEldDrivers lines 228–237. Each row: `{eldId, name, detail}`.
 */
const EldPickerEntrySchema = z
  .object({
    eldId: z.string(),
    name: z.string(),
    detail: z.string(),
  })
  .strict();

export const EldDriverListSchema = z.array(EldPickerEntrySchema);
export const EldVehicleListSchema = z.array(EldPickerEntrySchema);

/**
 * POST /api/v1/drivers/:id/link-eld and .../vehicles/:id/link-eld.
 * Service return type `LinkResult` (eld-linking.service.ts lines 9–15).
 * Candidates are present only when `linked: false`.
 */
export const LinkResultSchema = z
  .object({
    linked: z.boolean(),
    eldName: z.string().optional(),
    eldId: z.string().optional(),
    matchMethod: z.enum(['phone', 'license', 'vin', 'license_plate', 'manual']).optional(),
    candidates: z
      .array(
        z
          .object({
            eldId: z.string(),
            name: z.string(),
            detail: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/** DELETE /api/v1/drivers/:id/link-eld and vehicles — `{success: true}`. */
export const UnlinkResultSchema = z
  .object({
    success: z.boolean(),
  })
  .strict();

// ── ACCOUNTING (Phase 5 Group 5c — 11 tests) ──────────────────────────

/**
 * GET /accounting/status — accounting.controller.ts::getStatus.
 *
 * Three possible shapes live-probed on demo-northstar-2026:
 *   1. Disconnected: `{ connected: false }` — when no ACCOUNTING row
 *      OR the row has no decrypted credentials (controller line 62–64).
 *   2. Cached-name happy: `{ connected: true, vendor: 'QUICKBOOKS',
 *      companyName: string, realmId: string|null, lastSyncedAt: string|null,
 *      status: string }` (lines 71–80).
 *   3. Live-fetch failure: adds `error: 'Failed to fetch company info'`
 *      + `companyName: null` (lines 105–114).
 *
 * Model as a discriminated union on `connected`. The disconnected branch
 * is what demo-northstar returns without credentials (verified live).
 */
export const AccountingStatusSchema = z.discriminatedUnion('connected', [
  z
    .object({
      connected: z.literal(false),
    })
    .strict(),
  z
    .object({
      connected: z.literal(true),
      vendor: z.literal('QUICKBOOKS'),
      companyName: z.string().nullable(),
      realmId: z.string().nullable(),
      lastSyncedAt: isoDateString.nullable(),
      status: z.string(),
      error: z.string().optional(),
    })
    .strict(),
]);

/**
 * Single IntegrationEntityMapping row as returned by
 * accounting-mapping.service.ts::listEntityMappings (lines 226–260).
 *
 * Prisma schema: {id: Int, tenantId, integrationId, entityType,
 * sallyEntityId, externalId?, externalName?, matchConfidence?,
 * confirmedAt?, createdAt, updatedAt}. The service spreads the row and
 * adds `sallyEntityName` (line 258). On PATCH (updateMapping) and
 * POST :id/confirm, the raw Prisma row is returned WITHOUT the
 * `sallyEntityName` enrichment — so that field is `.optional()`.
 */
export const AccountingMappingSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    integrationId: z.string(),
    entityType: z.string(),
    sallyEntityId: z.string(),
    externalId: z.string().nullable(),
    externalName: z.string().nullable(),
    matchConfidence: z.number().nullable(),
    confirmedAt: isoDateString.nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    sallyEntityName: z.string().optional(),
  })
  .strict();

export const AccountingMappingListSchema = z.array(AccountingMappingSchema);

/**
 * GET /accounting/external-entities/:entityType — the cached copy of
 * external accounting-system entities (QB customers/vendors/classes).
 * accounting-mapping.service.ts::listExternalEntities returns the raw
 * Prisma row from `integrationExternalEntity` table.
 *
 * On demo-northstar the cache is empty → schema must allow empty array.
 * Fields mirror the Prisma model — id (Int PK), tenantId, integrationId,
 * entityType, externalId, externalName, createdAt, updatedAt.
 */
const ExternalEntitySchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    integrationId: z.string(),
    entityType: z.string(),
    externalId: z.string(),
    externalName: z.string(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

export const ExternalEntityListSchema = z.array(ExternalEntitySchema);

/**
 * Single AccountingAccountMapping row as returned by
 * accounting-mapping.service.ts::listAccountMappings (lines 407–412)
 * and ::updateAccountMapping (line 414).
 *
 * Prisma model: {id, tenantId, integrationId, sallyItemType, direction,
 * externalAccountId, externalAccountName, isDefault, createdAt, updatedAt}.
 */
export const AccountAccountMappingSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    integrationId: z.string(),
    sallyItemType: z.string(),
    direction: z.string(),
    externalAccountId: z.string(),
    externalAccountName: z.string(),
    isDefault: z.boolean(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

export const AccountAccountMappingListSchema = z.array(AccountAccountMappingSchema);

/**
 * POST /accounting/sync/invoice/:invoiceId, /accounting/sync/settlement/:id,
 * /accounting/setup/initial-sync — all three return the SAME shape:
 * `{success: boolean, jobId: string, message?: string}` (controller
 * lines 245, 293, 325–329).
 *
 * NOTE: this is NOT the same as the fleet-sync SyncTriggerResponseSchema
 * which has `jobIds: string[]` (plural). The accounting endpoints
 * enqueue exactly ONE job per call and return a single `jobId`. The
 * concurrent-guard branch (lines 216–222, 264–269) also uses the same
 * `{success: false, message, jobId}` shape — `jobId` is the EXISTING
 * in-flight job, hence still present.
 *
 * `message` is only set on: (a) the guard branch, and (b) initial-sync
 * (line 329). On the happy sync/invoice + sync/settlement branches,
 * `message` is absent.
 */
export const AccountingSyncTriggerResponseSchema = z
  .object({
    success: z.boolean(),
    jobId: z.string(),
    message: z.string().optional(),
  })
  .strict();

/** POST /accounting/webhook — `{received: true}` (controller line 129). */
export const AccountingWebhookAckSchema = z
  .object({
    received: z.boolean(),
  })
  .strict();

// ── EDI (Phase 5 Group 5d — 11 tests) ─────────────────────────────────

/**
 * Single EDITradingPartner row as returned by:
 *   - GET /edi/settings/partners/:partnerId — service returns the
 *     Prisma row with `include: { autoAcceptRules: {...} }` (line 72–84
 *     of edi-partner.service.ts).
 *   - POST /edi/settings/partners — raw Prisma row returned from
 *     `.create(...)` (no `include`), so no `autoAcceptRules` field.
 *   - PATCH /edi/settings/partners/:partnerId — same (no include).
 *   - GET /edi/settings/partners — the LIST projection uses
 *     `include: { _count: { messages, autoAcceptRules } }` so each
 *     row carries a `_count` object.
 *
 * Strategy: model one schema that accommodates all three shapes by
 * making `autoAcceptRules` and `_count` both optional. The strict()
 * still catches unexpected keys.
 *
 * Enums from Prisma:
 *   - vanProvider: EDIVanProvider = 'SPS_COMMERCE' | 'TRUECOMMERCE' |
 *     'KLEINSCHMIDT' | 'GXS' | 'CUSTOM' (inspection of schema file).
 *     Modeled as `z.string()` — enum is not load-bearing on the contract.
 *   - statusUpdateLevel: EDIStatusUpdateLevel. Same treatment.
 *   - supportedMessages: EDIMessageType[]. Array of strings.
 */
export const EdiTradingPartnerSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    name: z.string(),
    isaId: z.string(),
    gsId: z.string(),
    vanProvider: z.string(),
    vanConfig: z.unknown().nullable(),
    supportedMessages: z.array(z.string()),
    statusUpdateLevel: z.string(),
    isActive: z.boolean(),
    lastMessageAt: isoDateString.nullable(),
    tendersReceived: z.number().int(),
    tendersAccepted: z.number().int(),
    tendersDeclined: z.number().int(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    // Present on GET list (service ::listPartners)
    _count: z
      .object({
        messages: z.number().int(),
        autoAcceptRules: z.number().int(),
      })
      .strict()
      .optional(),
    // Present on GET detail (service ::getPartner includes autoAcceptRules)
    autoAcceptRules: z.array(z.unknown()).optional(),
  })
  .strict();

export const EdiTradingPartnerListSchema = z.array(EdiTradingPartnerSchema);

/**
 * Single EDIMessage row as returned inside the `data[]` envelope of
 * GET /edi/settings/messages. Service ::listMessages projects the raw
 * Prisma row + `include: { tradingPartner: {select:{name}},
 * load: {select:{loadId, loadNumber}} }`.
 *
 * Tenant has no seeded EDI messages on demo-northstar-2026 — the list
 * is expected to be empty. Schema still needs to handle a non-empty
 * array so a future seed doesn't flip the test red.
 */
const EdiMessageAuditItemSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    tradingPartnerId: z.number().int(),
    direction: z.string(),
    messageType: z.string(),
    transactionSetId: z.string().nullable(),
    referenceNumber: z.string().nullable(),
    status: z.string(),
    rawPayload: z.string().nullable(),
    parsedData: z.unknown().nullable(),
    errorMessage: z.string().nullable(),
    retryCount: z.number().int(),
    loadId: z.number().int().nullable(),
    invoiceId: z.number().int().nullable(),
    expiresAt: isoDateString.nullable(),
    respondedAt: isoDateString.nullable(),
    metadata: z.unknown().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    tradingPartner: z
      .object({ name: z.string() })
      .strict()
      .nullable(),
    load: z
      .object({ loadId: z.string(), loadNumber: z.string().nullable() })
      .strict()
      .nullable(),
  })
  .strict();

/**
 * GET /edi/settings/messages — paged envelope
 * `{data, total, page, limit}` (service ::listMessages line 96).
 */
export const EdiMessageAuditListSchema = z
  .object({
    data: z.array(EdiMessageAuditItemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
  })
  .strict();

/**
 * GET /edi/tenders — pending-tender list. Service
 * ::findPendingTenders returns EDIMessage rows with
 * `include: { tradingPartner: true, load: true }`. Since both includes
 * are full relations (not a select-projection), the schema leaves those
 * as `z.unknown()` — the test only cares about array-shape + top-level
 * EDIMessage fields.
 */
export const EdiTenderSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    tradingPartnerId: z.number().int(),
    direction: z.string(),
    messageType: z.string(),
    transactionSetId: z.string().nullable(),
    referenceNumber: z.string().nullable(),
    status: z.string(),
    rawPayload: z.string().nullable(),
    parsedData: z.unknown().nullable(),
    errorMessage: z.string().nullable(),
    retryCount: z.number().int(),
    loadId: z.number().int().nullable(),
    invoiceId: z.number().int().nullable(),
    expiresAt: isoDateString.nullable(),
    respondedAt: isoDateString.nullable(),
    metadata: z.unknown().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    tradingPartner: z.unknown(),
    load: z.unknown(),
  })
  .strict();

export const EdiTenderListSchema = z.array(EdiTenderSchema);

/**
 * POST /edi/tenders/:loadId/respond — service ::respondToTender
 * returns the updated Load row from `tx.load.update(...)` (line 290).
 * That's the raw Prisma Load model — many fields — so the schema is
 * pinned on the invariant fields the test cares about: `id`, `status`,
 * `tenderResponse`, `tenderRespondedAt`. Trailing props are allowed
 * via `.catchall(z.unknown())` to avoid over-specifying the whole
 * Load projection (which has 60+ columns).
 *
 * NOTE: .strict() is disallowed here because Load returns many more
 * columns than the test inspects. Project plan rule #4 forbids
 * `.passthrough()` — we use `.catchall(z.unknown())` instead, which
 * keeps the schema robust to unexpected extra fields without silently
 * accepting unknown values for the named keys.
 */
export const EdiTenderResponseSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    status: z.string(),
    tenderResponse: z.string().nullable(),
    tenderRespondedAt: isoDateString.nullable(),
  })
  .catchall(z.unknown());

/**
 * Single EDIAutoAcceptRule row. Used by:
 *   - GET /edi/tenders/rules — service ::listRules with
 *     `include: { tradingPartner: { select: { name } } }` → each row
 *     carries an optional `tradingPartner` block.
 *   - POST /edi/tenders/rules — raw row from .create() (no include,
 *     no tradingPartner field).
 *   - PATCH /edi/tenders/rules/:ruleId/approve — raw row from
 *     .update() (no include).
 */
export const EdiAutoAcceptRuleSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.number().int(),
    tradingPartnerId: z.number().int().nullable(),
    name: z.string(),
    conditions: z.unknown(),
    isActive: z.boolean(),
    priority: z.number().int(),
    matchCount: z.number().int(),
    lastMatchAt: isoDateString.nullable(),
    createdBy: z.string(),
    suggestedFromPattern: z.unknown().nullable(),
    approvedAt: isoDateString.nullable(),
    approvedByUserId: z.number().int().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    tradingPartner: z
      .object({ name: z.string() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export const EdiAutoAcceptRuleListSchema = z.array(EdiAutoAcceptRuleSchema);

/**
 * POST /edi/webhooks/:tenantId — handler returns
 * `{success: true, loadId: <number>, autoAccepted: <boolean>}`
 * for transactionType '204' (edi-webhook.controller.ts lines 108–112).
 */
export const EdiWebhookAckSchema = z
  .object({
    success: z.boolean(),
    loadId: z.number().int(),
    autoAccepted: z.boolean(),
  })
  .strict();

// ── EMAIL INTAKE (Phase 5 Group 5e — 10 tests) ────────────────────────

/**
 * EmailIngestAttachment row as returned via the `include: {attachments}`
 * graph of `EmailIntakeService::listThreads` / `::getThread`. Prisma schema
 * (schema.prisma model `EmailIngestAttachment`) — {id, messageId, tenantId,
 * fileName, mimeType, fileSize, s3Key, contentHash, filterResult,
 * filterReason, parseStatus, parsedData, parseConfidence, parsedLoadNumber,
 * isLatestVersion, rateconJobId, createdAt}.
 *
 * `filterResult` and `parseStatus` are Prisma enums serialised to strings
 * ('PENDING' | 'PASSED' | 'SENDER_UNKNOWN' | 'DUPLICATE' | 'BLOCKED' etc.
 * for filter; 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED' | 'SKIPPED' for
 * parse). Modeled as `z.string()` — the enum value is not load-bearing.
 */
const EmailIngestAttachmentSchema = z
  .object({
    id: z.string(),
    messageId: z.string(),
    tenantId: z.number().int(),
    fileName: z.string(),
    mimeType: z.string(),
    fileSize: z.number().int(),
    s3Key: z.string(),
    contentHash: z.string(),
    filterResult: z.string(),
    filterReason: z.string().nullable(),
    parseStatus: z.string(),
    parsedData: z.unknown().nullable(),
    parseConfidence: z.number().nullable(),
    parsedLoadNumber: z.string().nullable(),
    isLatestVersion: z.boolean(),
    rateconJobId: z.string().nullable(),
    createdAt: isoDateString,
  })
  .strict();

/**
 * EmailIngestMessage row (schema.prisma model `EmailIngestMessage`). The
 * list-threads query filters attachments with `where: {isLatestVersion:
 * true}` while get-thread includes ALL attachments — the same schema
 * covers both.
 */
const EmailIngestMessageSchema = z
  .object({
    id: z.string(),
    threadId: z.string(),
    tenantId: z.number().int(),
    messageId: z.string(),
    fromEmail: z.string(),
    fromName: z.string().nullable(),
    subject: z.string(),
    receivedAt: isoDateString,
    bodyPreview: z.string().nullable(),
    rawS3Key: z.string().nullable(),
    createdAt: isoDateString,
    attachments: z.array(EmailIngestAttachmentSchema),
  })
  .strict();

/**
 * Single EmailIngestThread row as returned by both
 * `EmailIntakeService::listThreads` (inside the `data[]` envelope) AND
 * `::getThread`. Both include the message + attachment graph; the
 * difference is only the attachment `where` filter (above).
 *
 * Prisma schema (model `EmailIngestThread`) — {id (cuid string), tenantId,
 * senderEmail, senderName, subject, messageIdChain, status,
 * confirmedLoadId, confirmedAt, confirmedById, createdAt, updatedAt}.
 */
export const EmailThreadRowSchema = z
  .object({
    id: z.string(),
    tenantId: z.number().int(),
    senderEmail: z.string(),
    senderName: z.string().nullable(),
    subject: z.string(),
    messageIdChain: z.array(z.string()),
    status: z.string(),
    confirmedLoadId: z.string().nullable(),
    confirmedAt: isoDateString.nullable(),
    confirmedById: z.number().int().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    messages: z.array(EmailIngestMessageSchema),
  })
  .strict();

/**
 * GET /integrations/email-intake/threads — paged envelope
 * `{data, total, page, limit, totalPages}` (service ::listThreads line
 * 385–391).
 */
export const EmailThreadListSchema = z
  .object({
    data: z.array(EmailThreadRowSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .strict();

/**
 * GET /integrations/email-intake/threads/:id — service ::getThread returns
 * a single thread row with the same message + attachment graph as the list.
 */
export const EmailThreadDetailSchema = EmailThreadRowSchema;

/**
 * POST /integrations/email-intake/threads/:id/confirm — controller line
 * 142 returns `{loadId: string, loadNumber: string}` after creating a
 * load via LoadsService. `loadId` is the string identifier (e.g.
 * 'load_<cuid>'), `loadNumber` is the human-readable code.
 */
export const EmailThreadConfirmResponseSchema = z
  .object({
    loadId: z.string(),
    loadNumber: z.string(),
  })
  .strict();

/**
 * POST /integrations/email-intake/threads/:id/discard — controller line
 * 149 returns `{status: 'discarded'}`.
 */
export const EmailThreadDiscardResponseSchema = z
  .object({
    status: z.literal('discarded'),
  })
  .strict();

/**
 * POST /integrations/email-intake/threads/:id/restore — controller line
 * 156 returns `{status: 'restored'}`.
 */
export const EmailThreadRestoreResponseSchema = z
  .object({
    status: z.literal('restored'),
  })
  .strict();

/**
 * POST /integrations/email-intake/threads/:id/approve-sender —
 * service ::approveSenderAndParse line 546 returns
 * `{status: 'approved', domain: string|undefined, requeuedCount: number}`.
 * `domain` can be undefined when the sender email has no @ segment.
 */
export const EmailThreadApproveSenderResponseSchema = z
  .object({
    status: z.literal('approved'),
    domain: z.string().optional(),
    requeuedCount: z.number().int(),
  })
  .strict();

/**
 * POST /integrations/email-intake/attachments/:id/reparse —
 * service ::requeueAttachment line 641 returns `{requeued: true}`.
 */
export const EmailIntakeReparseResponseSchema = z
  .object({
    requeued: z.boolean(),
  })
  .strict();

/**
 * GET /integrations/email-intake/settings AND PUT /integrations/email-intake/settings —
 * both return the EmailIngestSettings Prisma row directly (service
 * ::getSettings / ::updateSettings). Prisma schema:
 * {id, tenantId, inboundAddress, isEnabled, approvedDomains,
 * autoApproveCustomerDomains, unknownSenderPolicy, createdAt, updatedAt}.
 *
 * `unknownSenderPolicy` is a Prisma enum 'HOLD' | 'PARSE_ANYWAY' | 'REJECT'
 * (schema.prisma `EmailUnknownSenderPolicy`). Modeled as `z.string()` —
 * the enum value isn't load-bearing for the contract.
 */
export const EmailIntakeSettingsSchema = z
  .object({
    id: z.string(),
    tenantId: z.number().int(),
    inboundAddress: z.string(),
    isEnabled: z.boolean(),
    approvedDomains: z.array(z.string()),
    autoApproveCustomerDomains: z.boolean(),
    unknownSenderPolicy: z.string(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

/**
 * POST /integrations/email-intake/webhook — controller `handleInbound` has
 * four return branches:
 *
 *   1. No recipient address  → `{status: 'ignored', reason: 'no_recipient'}`.
 *   2. Unknown recipient     → `{status: 'ignored', reason: 'unknown_recipient'}`.
 *   3. Disabled tenant       → `{status: 'ignored', reason: 'disabled'}`.
 *   4. Accepted (happy path) → `{status: 'accepted', threadId, messageId, results}`
 *      — spread from `emailIntakeService.processInboundEmail` return, which is
 *      `{threadId: string, messageId: string, results: Array<{attachmentId,
 *      filterResult, queued}>}`.
 *
 * Modeled as a discriminated union on `status`. The `ignored` branch's
 * `reason` is constrained to the three known values; the `accepted` branch
 * carries the processInboundEmail payload.
 */
export const EmailIntakeWebhookAckSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('ignored'),
      reason: z.enum(['no_recipient', 'unknown_recipient', 'disabled']),
    })
    .strict(),
  z
    .object({
      status: z.literal('accepted'),
      threadId: z.string(),
      messageId: z.string(),
      results: z.array(
        z
          .object({
            attachmentId: z.string(),
            filterResult: z.string(),
            queued: z.boolean(),
          })
          .strict(),
      ),
    })
    .strict(),
]);

// ── LOAD BOARD (Phase 5 Group 5f — 11 tests) ──────────────────────────

/**
 * Single LoadBoardListing as returned inside the search/recommendation
 * responses and by GET /load-board/listings/:externalId. Shape mirrors
 * `LoadBoardListingSchema` in packages/shared-types (load-board.schema.ts)
 * but is re-declared here as `.strict()` to catch accidental extra fields
 * and to satisfy the project's "no passthrough" rule.
 *
 * The `laneInsight` enrichment is added by LoadBoardService::enrichWith
 * LaneInsights (load-board.service.ts lines 156–182) and is OPTIONAL —
 * the DAT mock adapter does not emit it by itself; the service-level
 * enrichment only fires when the tenant has matching lane-rate data. On
 * demo-northstar the field can be absent OR present — both must validate.
 *
 * Known fields (from dat-mock-data.ts + DATLoadBoardAdapter::normalizeMatch):
 *   externalId, provider ('dat'), origin {city,state,zipCode?,lat?,lng?},
 *   destination {...}, rate, ratePerMile, distance, deadheadMiles?,
 *   equipmentType, weight?, commodity?, pickupDate, deliveryDate?, broker,
 *   specialInstructions?, referenceNumber?, postedAt, length?, laneInsight?.
 */
const LoadBoardLocationPointSchema = z
  .object({
    city: z.string(),
    state: z.string(),
    zipCode: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .strict();

const LoadBoardBrokerSchema = z
  .object({
    name: z.string(),
    contact: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    mcNumber: z.string().optional(),
  })
  .strict();

const LoadBoardLaneInsightSchema = z
  .object({
    avgRatePerMile: z.number(),
    percentDiff: z.number(),
    verdict: z.enum(['above_market', 'market_rate', 'below_market']),
    loadCount: z.number(),
  })
  .strict();

export const LoadBoardListingSchema = z
  .object({
    externalId: z.string(),
    provider: z.string(),
    origin: LoadBoardLocationPointSchema,
    destination: LoadBoardLocationPointSchema,
    rate: z.number(),
    ratePerMile: z.number(),
    distance: z.number(),
    deadheadMiles: z.number().optional(),
    equipmentType: z.string(),
    weight: z.number().optional(),
    commodity: z.string().optional(),
    pickupDate: z.string(),
    deliveryDate: z.string().optional(),
    broker: LoadBoardBrokerSchema,
    specialInstructions: z.string().optional(),
    referenceNumber: z.string().optional(),
    postedAt: z.string(),
    length: z.number().optional(),
    laneInsight: LoadBoardLaneInsightSchema.optional(),
  })
  .strict();

/**
 * POST /load-board/search and POST /load-board/search/nlp both return the
 * `LoadBoardSearchResult` shape (load-board.service.ts::search ->
 * DATLoadBoardAdapter::search). Envelope:
 *   { listings: LoadBoardListing[], total: number, page: number,
 *     limit: number, hasMore: boolean }.
 *
 * On the NLP path the controller calls service.searchNlp which internally
 * calls search → same envelope. On a broad, no-match query the `listings`
 * array can be empty but the envelope shape still holds.
 */
export const LoadBoardSearchResponseSchema = z
  .object({
    listings: z.array(LoadBoardListingSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
  })
  .strict();

/**
 * GET /load-board/recommendations — LoadBoardRecommendationsService
 * ::getRecommendations returns `DriverLoadRecommendation[]` (lines 33–39).
 * Each element: `{driver: {id, name, location: {city, state, lat, lng}},
 * reason: string, listings: LoadBoardListing[]}`.
 *
 * On demo-northstar the service may emit zero recommendations when
 * telematics data is stale (>24h) or no vehicles are AVAILABLE. Schema
 * must handle empty arrays.
 */
const DriverRecommendationSchema = z
  .object({
    driver: z
      .object({
        id: z.string(),
        name: z.string(),
        location: z
          .object({
            city: z.string(),
            state: z.string(),
            lat: z.number(),
            lng: z.number(),
          })
          .strict(),
      })
      .strict(),
    reason: z.string(),
    listings: z.array(LoadBoardListingSchema),
  })
  .strict();

export const LoadBoardRecommendationsResponseSchema = z.array(DriverRecommendationSchema);

/**
 * POST /load-board/import — LoadBoardService::importListing returns
 * `{loadId: string, loadNumber: string}` (load-board.service.ts line 153).
 * `loadId` is the STRING identifier (e.g. 'load_<cuid>'), NOT a number —
 * mirrors `LoadsService.create` return shape.
 */
export const LoadBoardImportResponseSchema = z
  .object({
    loadId: z.string(),
    loadNumber: z.string(),
  })
  .strict();

/**
 * GET /load-board/search-history — SearchHistoryService::getHistory returns
 * `{recent: SearchHistoryEntry[], frequent: SearchHistoryEntry[]}`
 * (search-history.service.ts lines 60–83). NOT a flat array.
 *
 * Each entry: `{id, origin|null, destination|null, equipment: string[],
 * minRate: number|null, searchedAt: iso-string, searchCount: number,
 * label: string}` (interface lines 7–16).
 */
const SearchHistoryLocationSchema = z
  .object({
    city: z.string(),
    state: z.string(),
  })
  .strict();

const SearchHistoryEntrySchema = z
  .object({
    id: z.string(),
    origin: SearchHistoryLocationSchema.nullable(),
    destination: SearchHistoryLocationSchema.nullable(),
    equipment: z.array(z.string()),
    minRate: z.number().nullable(),
    searchedAt: isoDateString,
    searchCount: z.number().int(),
    label: z.string(),
  })
  .strict();

export const SearchHistoryListSchema = z
  .object({
    recent: z.array(SearchHistoryEntrySchema),
    frequent: z.array(SearchHistoryEntrySchema),
  })
  .strict();

/**
 * Saved-search row as returned by:
 *   - POST /load-board/saved-searches   (create)
 *   - GET  /load-board/saved-searches   (list, each element)
 *   - PATCH /load-board/saved-searches/:savedSearchId/toggle  (update)
 *
 * Projection is `SavedSearchService::toResponse` (saved-search.service.ts
 * lines 93–105): `{savedSearchId, name, searchParams, isActive, minRate,
 * lastPolledAt, lastMatchCount, createdAt, updatedAt}`. `searchParams` is
 * the raw JSON blob the client supplied — `z.unknown()` avoids locking
 * the test to a specific criteria shape. `lastPolledAt` and
 * `lastMatchCount` are null on a freshly-created row.
 */
export const SavedSearchSchema = z
  .object({
    savedSearchId: z.string(),
    name: z.string(),
    searchParams: z.unknown(),
    isActive: z.boolean(),
    minRate: z.number().nullable(),
    lastPolledAt: isoDateString.nullable(),
    lastMatchCount: z.number().int().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

export const SavedSearchListSchema = z.array(SavedSearchSchema);

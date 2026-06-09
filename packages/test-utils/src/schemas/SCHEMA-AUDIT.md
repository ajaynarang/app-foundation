# Schema Audit — `@app/test-utils/schemas` vs `@app/shared-types`

**Date:** 2026-04-17
**Status:** DOC ONLY — no schemas were modified. Migration is Phase 1+.
**Purpose:** Identify which hand-written Zod schemas in `@app/test-utils/schemas/`
have a direct equivalent in `@app/shared-types/` so they can be replaced
incrementally during Phase 1–7 test rewrites.

---

## How to read this audit

- ✅ `replaced by @app/shared-types/<path>` — a semantically equivalent schema
  exists in shared-types. When the test using this schema is rewritten (Phase 1+),
  import from shared-types with `.strict()` instead.
- ⚠️ `no shared-types equivalent, keep hand-written` — shared-types has nothing
  matching this shape. The hand-written schema is the source of truth for now.
- 🔁 `partial overlap` — shared-types has a related schema, but the test-utils
  version covers a different endpoint response shape (e.g., list vs. detail vs.
  create response). Keep both until the backend drifts are resolved.

---

## `schemas/drivers.ts`

| Schema name                  | Status                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DriverListItemSchema`       | 🔁 partial overlap — `@app/shared-types/fleet/driver.schema.ts` exports `DriverSchema` but it targets the driver detail shape. The list item shape (with `activeLoadCounts`, `currentHos`, `appAccessStatus`) is not separately exported. Keep hand-written until Phase 1 audit confirms the list endpoint response matches `DriverSchema`. |
| `CreateDriverResponseSchema` | ⚠️ no shared-types equivalent — shared-types has no separate create-response type. The `DriverSchema` in shared-types is a superset but includes optional fields that CREATE doesn't return. Keep hand-written.                                                                                                                             |
| `UpdateDriverResponseSchema` | ⚠️ no shared-types equivalent — same reasoning as above. Keep hand-written.                                                                                                                                                                                                                                                                 |
| `DriverDetailSchema`         | 🔁 partial overlap — `DriverSchema` in `@app/shared-types/src/fleet/driver.schema.ts` is semantically close. Verify during Phase 1 whether all fields match (especially `hosData`, `upcomingLoads`, `currentLoad`). If confirmed equivalent, replace with `DriverSchema.strict()`.                                                          |

---

## `schemas/vehicles.ts`

| Schema name                   | Status                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VehicleListItemSchema`       | 🔁 partial overlap — `VehicleSchema` in `@app/shared-types/src/fleet/vehicle.schema.ts` covers the core fields. List item adds `activeLoadCounts`, `telematics`, `upcomingUnavailability` not in shared-types. Keep hand-written until Phase 1 confirms field alignment. |
| `CreateVehicleResponseSchema` | ⚠️ no shared-types equivalent — no separate create response type. Keep hand-written.                                                                                                                                                                                     |
| `UpdateVehicleResponseSchema` | ⚠️ no shared-types equivalent — aliased to CreateVehicleResponseSchema. Keep hand-written.                                                                                                                                                                               |

---

## `schemas/loads.ts`

| Schema name                | Status                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateLoadResponseSchema` | 🔁 partial overlap — `@app/shared-types/src/fleet/load.schema.ts` exports `LoadSchema` but covers the detail shape. Create response is a subset with `intakeSource`. Verify during Phase 1.                                                                                                        |
| `LoadListItemSchema`       | 🔁 partial overlap — `LoadSchema` is the detail type; a separate list-item type is not exported from shared-types. `LoadStatusSchema` and `LoadBillingStatusSchema` can be imported immediately. Keep list-item hand-written.                                                                      |
| `LoadDetailSchema`         | 🔁 partial overlap — `LoadSchema` in shared-types covers most fields. `LoadStopSchema` in shared-types differs from the test-utils `StopSchema` (different field names: `stopId` as `number` vs `string`, `sequenceOrder` vs `sequence`). Do NOT replace until field drift is resolved in Phase 1. |
| `LoadStatusChangeSchema`   | ⚠️ no shared-types equivalent — no status-change response schema. Keep hand-written.                                                                                                                                                                                                               |

---

## `schemas/customers.ts`

| Schema name   | Status                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (all schemas) | ✅ replaced by `@app/shared-types/src/fleet/customer.schema.ts` — `CustomerSchema` is available. Verify field completeness during Phase 1 fleet tests, then switch to `CustomerSchema.strict()`. |

---

## `schemas/invoices.ts`

| Schema name             | Status                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `InvoiceListItemSchema` | 🔁 partial overlap — `@app/shared-types/src/financials/invoice.schema.ts` has `InvoiceStatusSchema`, `LineItemTypeSchema` enums + a detail schema. A dedicated list-item schema is not separately exported. Keep hand-written. |
| `InvoiceDetailSchema`   | 🔁 partial overlap — shared-types has an invoice detail schema. Compare during Phase 2 (`paidCents`, `balanceCents` fields may differ from the backend response).                                                              |
| `InvoiceSummarySchema`  | ⚠️ no shared-types equivalent. Keep hand-written.                                                                                                                                                                              |
| `InvoiceSettingsSchema` | ⚠️ no shared-types equivalent. Keep hand-written.                                                                                                                                                                              |

---

## `schemas/settlements.ts`

| Schema name                | Status                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SettlementListItemSchema` | 🔁 partial overlap — `@app/shared-types/src/financials/settlement.schema.ts` has `SettlementStatusSchema` and related enums. No separate list-item response type. Keep hand-written. |
| `SettlementDetailSchema`   | 🔁 partial overlap — verify during Phase 2 whether shared-types settlement schema covers all fields.                                                                                 |
| `SettlementSummarySchema`  | ⚠️ no shared-types equivalent. Keep hand-written.                                                                                                                                    |
| `PayStructureSchema`       | 🔁 partial overlap — `PayStructureTypeSchema` in shared-types covers the enum. Full response shape is not exported. Keep hand-written.                                               |

---

## `schemas/operations.ts`

| Schema name                   | Status                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AlertListItemSchema`         | ✅ replaced by `@app/shared-types/src/operations/alert.schema.ts` — `AlertSchema` is available. Verify `priority`, `category`, `acknowledgedAt` field names match during Phase 3. |
| `AlertDetailSchema`           | 🔁 partial overlap — `AlertSchema` is the base; detail may add `notes`, `childAlerts`, `metadata`. Extend from shared-types during Phase 3.                                       |
| `AlertStatsSchema`            | ⚠️ no shared-types equivalent. Keep hand-written.                                                                                                                                 |
| `CommandCenterOverviewSchema` | 🔁 partial overlap — `@app/shared-types/src/operations/command-center.schema.ts` exists. Compare during Phase 3.                                                                  |
| `ShiftNoteSchema`             | ⚠️ no shared-types equivalent. Keep hand-written.                                                                                                                                 |
| `ShieldScoreSchema`           | 🔁 partial overlap — `@app/shared-types/src/operations/shield.schema.ts` exists. Verify during Phase 3.                                                                           |
| `ShieldAuditSchema`           | ⚠️ no shared-types equivalent as a standalone response type. Keep hand-written.                                                                                                   |
| `ShieldFindingSchema`         | ⚠️ no shared-types equivalent as a standalone response type. Keep hand-written.                                                                                                   |
| `ShieldRuleSchema`            | ⚠️ no shared-types equivalent as a standalone response type. Keep hand-written.                                                                                                   |
| `NotificationSchema`          | ⚠️ no shared-types equivalent (monitoring.schema.ts covers monitoring, not notification list items). Keep hand-written.                                                           |
| `NotificationCountSchema`     | ⚠️ no shared-types equivalent. Keep hand-written.                                                                                                                                 |

---

## `schemas/platform.ts`

| Schema name                  | Status                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `UserListItemSchema`         | ✅ replaced by `@app/shared-types/src/platform/user.schema.ts` — `UserSchema` is available. Verify during Phase 4.         |
| `UserDetailSchema`           | 🔁 partial overlap — `UserSchema` is close; the `driver` and `tenant` nested fields may differ. Verify during Phase 4.     |
| `TenantListItemSchema`       | ✅ replaced by `@app/shared-types/src/platform/tenant.schema.ts` — `TenantSchema` is available. Verify during Phase 4.     |
| `TenantDetailSchema`         | 🔁 partial overlap — `TenantSchema` may lack `trialStartedAt`, `trialEndsAt`, `onboardingProgress`. Verify during Phase 4. |
| `SubdomainCheckSchema`       | ⚠️ no shared-types equivalent. Keep hand-written.                                                                          |
| `ApiKeySchema`               | ⚠️ no shared-types equivalent for the API key response type. Keep hand-written.                                            |
| `CreateApiKeyResponseSchema` | ⚠️ no shared-types equivalent. Keep hand-written (the full key is only returned on creation).                              |

---

## `schemas/helpers.ts`

| Export                                                                   | Status                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `expectContract`, `expectArrayContract`, `expectPaginatedContract`       | ⚠️ test-utils utilities — not from shared-types, not candidates for replacement.                 |
| `isoDateString`, `dateOnlyString`, `nullableIsoDate`, `nullableDateOnly` | ⚠️ no shared-types equivalent. Keep here as the canonical source for test validation primitives. |
| `dbId`, `stringId`                                                       | ⚠️ no shared-types equivalent. Keep here.                                                        |

---

## Summary

| Status                                            | Count           |
| ------------------------------------------------- | --------------- |
| ✅ Full shared-types equivalent confirmed         | 4 schema groups |
| 🔁 Partial overlap — verify during relevant phase | 11 schemas      |
| ⚠️ No shared-types equivalent — keep hand-written | 17 schemas      |

**Migration strategy:**

- Import `StatusSchema` enums (LoadStatus, InvoiceStatus, SettlementStatus, VehicleStatus)
  from `@app/shared-types` immediately — they are non-overlapping and safe.
- Defer replacing full response schemas until the Phase that rewrites each domain's tests.
  Each phase should run with `.strict()` on the replacement schema to catch field drift early.
- Never remove a hand-written schema before confirming the shared-types equivalent is
  semantically identical against the live backend response.

---

## Phase 3 notes (2026-04-19)

Phase 3 rewrote the operations-domain factories, schemas, and helpers. The
schema audit for this domain:

### Shared-types adopted straight (no local hand-writing)

- `AlertSchema`, `AlertStatsSchema`, `SmartAlertStatsSchema`,
  `VolumeDataSchema`, `ResponseTimeEntrySchema`, `ResolutionDataSchema`,
  `TopAlertTypeSchema`, `HistoryResultSchema` — re-exported from
  `@app/test-utils/schemas/operations.ts` as
  `AlertSharedSchema` / `AlertStatsSharedSchema` / `AlertAnalyticsVolumeSchema`
  / `AlertResponseTimeTrendSchema` / `AlertResolutionRatesSchema` /
  `AlertTopTypesSchema` / `AlertHistoryResponseSchema`.
- `ShieldAuditSchema`, `ShieldLatestResponseSchema`, `ShieldFindingSchema`,
  `ShieldCustomRuleSchema`, `TriggerAuditResponseSchema`,
  `AuditHistoryResponseSchema` — re-exported as Phase-3 aliases in
  `schemas/operations.ts`.
- `CommandCenterOverviewSchema`, `SystemHealthSchema`,
  `MessageSummaryResponseSchema` — ditto.
- `ShiftNoteSchema`, `ShiftNotesResponseSchema` — re-exported from the new
  `schemas/shift-notes.ts`.
- `SupportTicketSchema`, `SupportTicketDetailSchema`, `SupportStatsSchema`,
  `PaginatedTicketsSchema`, `TicketMessageSchema` — re-exported from the new
  `schemas/support.ts`.

### Partial overlap (hand-written because shared-types lacks)

- `AlertBriefingSchema` — shared-types ships the `AlertBriefing` / `AlertBriefingSituation`
  TS interfaces but **no Zod schema**. Hand-written in `schemas/operations.ts`
  mirroring those interfaces.
- `CommandCenterMapDataSchema` — shared-types has no Zod schema for the
  `/command-center/map-data` endpoint; only the backend-side `MapTruckLocationDto`
  TypeScript interface exists. Hand-written in `schemas/operations.ts`.
- `AlertGroupedSchema` — shared-types ships the `GroupedAlert` TS interface but
  no Zod schema. Hand-written in `schemas/operations.ts`.

### No shared-types coverage at all (hand-written)

- `HorizonGridSchema`, `DriverUnavailabilitySchema`, `VehicleUnavailabilitySchema`
  — new file `schemas/horizon.ts`. These responses have no shared-types Zod
  coverage; only the backend-side `horizon.types.ts` TypeScript interfaces
  describe them.
- `IftaQuarterSchema`, `IftaQuarterDetailSchema`, `IftaQuarterSummarySchema`,
  `IftaMileageEntrySchema`, `IftaFuelPurchaseSchema`, `IftaTaxRateSchema`,
  `IftaCalculateResponseSchema` — new file `schemas/ifta.ts`. `packages/shared-types/src/ifta`
  does export some TS types but NO response-envelope Zod schemas.
- `ShiftNoteSchema` in the legacy `schemas/operations.ts` is retained for
  pre-Phase-3 specs but supplanted by the shared-types-backed schema in
  `schemas/shift-notes.ts`. Delete the legacy export once every pre-Phase-3
  alerts/command-center spec has been removed.

### Outstanding TODO(phase-3-verify) hotspots

- `CustomRule` DTO — the factory accepts the structured-rule signature from
  the spec document, but the live DTO only has `rule: string`. Verify on
  first live run whether the DTO grows structured fields.
- `DriverUnavailabilitySchema` / `VehicleUnavailabilitySchema` — date fields
  may come back as full timestamps on the CRUD path vs date-only on the
  grid path. Verify and tighten once observed.
- `IftaCalculateResponseSchema` — the live `calculateQuarter` return shape
  is inferred from the service code; confirm envelope on first live run.
- Monitoring driver-event DTO mapping — spec signature uses `lat/lng`, DTO
  uses `latitude/longitude`. Factory maps internally; verify no regressions
  after first live run.
- Support `UpdateTicketDto.assignee` — not a live DTO field; factory drops
  it. Verify on live run whether the DTO grows this field.

---

## Phase 4 Group 4a notes (2026-04-20)

Phase 4 Group 4a adds the public-surface + self-service-prefs schemas.

### Shared-types adopted straight (with `.strict()` at call sites)

- `FeatureFlagSchema` / `FeatureFlagsResponseSchema` / `FeatureFlagEnabledResponseSchema`
  → re-exported as `FeatureFlagSchema` / `FeatureFlagListSchema` /
  `FeatureFlagEnabledSchema`. Live response matches 1:1 with DTO.
- `OnboardingStatusResponseSchema` → re-exported as `OnboardingStatusSchema`.
- `DriverPreferencesSchema` → re-exported. Live response matches.

### Hand-written due to drift from shared-types (tracked in finding #35)

- **`ReferenceDataItemSchema` / `ReferenceDataSchema`** — shared-types
  `ReferenceItemSchema` declares `sortOrder` (camelCase), but the live
  response on `GET /reference-data` serialises `sort_order` (snake_case).
  The service copies the Prisma row and manually emits snake_case.
- **`AlertConfigSchema` / `AlertConfigRowSchema`** — shared-types
  `AlertConfigurationSchema` models a different shape than the live response:
  shared-types has `alertTypes.*` with `mandatory/thresholdPercent/thresholdMinutes`
  and `defaultChannels.*` with `sms`, but the live response carries
  `alertTypes.* = { enabled, priority, autoResolve }`, `escalationPolicy.levels[]`,
  and `defaultChannels.*` with `{ push, email, inApp }` (no sms). Service
  `getDefaults()` also drifts from both.
- **`OperationsSettingsSchema`** — shared-types marks
  `estimatedDieselPricePerGallon` + `splitSleeperThresholdHours` optional;
  live response always carries them. Hand-written for strictness.
- **`OperationsSettingsDefaultsSchema`** — no shared-types equivalent.
  Envelope from `GET /settings/operations/defaults` has no
  `id` / `tenantId` / timestamps.
- **`UserPreferencesSchema`** — hand-written to permit empty
  `alertChannels: {}` (shared-types models the full per-priority shape).
- **`SuperAdminPreferencesSchema`** — NOT in shared-types. Three-field
  shape; `notificationFrequency` enum = `'immediate' | 'daily'`.

---

## Phase 4 Group 4b notes (2026-04-20)

Phase 4 Group 4b adds feedback + api-keys schemas and rewrites the legacy
Phase-0 `ApiKeySchema` that described a prior API shape.

### Replaced in place (legacy Phase-0 schemas that no longer matched live)

- **`ApiKeySchema` / `CreateApiKeyResponseSchema`** — the Phase-0 version
  declared fields (`keyId`, `prefix`, numeric `id`) that do not exist on the
  current `ApiKeyDto`. Rewritten against the live response (which matches
  `@app/shared-types/platform/api-key.schema.ts` `ApiKeyResponseSchema`
  1:1). Kept local (not re-exported) so the list variant enforces `key`
  absent (shared-types models it `.optional()` which would silently accept
  a leak). Finding #36.

### Hand-written due to drift from shared-types (finding #36)

- **`FeedbackRowSchema`** — full Prisma row shape on `POST /feedback` and
  every admin `PATCH /:id/*` transition. Adds `tenantId`, `userId`,
  `resolvedBy`, `updatedAt` which shared-types `FeedbackSchema` omits.
- **`FeedbackOwnRowSchema`** — trimmed projection on `GET /feedback`
  (listOwn). The service explicitly `select`s only 7 fields; shared-types
  models the full row.
- **`FeedbackAdminRowSchema`** — FeedbackRowSchema + nested `user` /
  `tenant` / `resolver` relations, each `.strict()`. Shared-types models
  the relations as optional on the base schema, which permits ambiguity
  between detail and list variants.
- **`FeedbackListEnvelopeSchema`** — pagination envelope around admin rows.
  Shared-types ships `FeedbackListResponseSchema` but references the lax
  `FeedbackSchema`; we re-compose under `.strict()`.
- **`FeedbackStatsSchema`** — matches shared-types, but re-composed locally
  with `.strict()` on the `bySentiment` item shape.
- **`FeedbackTenantSummarySchema`** — thin `{id, companyName}` envelope;
  no shared-types equivalent.
- **`FeedbackBulkCategorizeSchema`** — the service returns EITHER
  `{ categorized: 0 }` when no uncategorized rows exist, OR
  `{ categorized, total }` when rows were processed. `total` is modelled
  optional to keep `.strict()` viable across the branch. Finding #36.

---

## Phase 4 Group 4c notes (2026-04-20)

Phase 4 Group 4c rewrites the tenant schemas (originally `z.any()`-wide
Phase-0 placeholders) against the live `TenantsController` responses. The
shared-types `platform/tenant.schema.ts` file ships paper-thin schemas
(`TenantDetailsSchema` / `TenantListItemSchema` / `UpdateTenantSchema`)
that miss the status / dotNumber / carrierType / mcNumber / fleetSize /
approval / rejection / suspension / reactivation / plan-metadata fields
the live API returns. Hand-written here — tracked in finding #37.

### Replaced in place (legacy Phase-0 schemas that were too loose)

- **`TenantListItemSchema` / `TenantDetailSchema` / `SubdomainCheckSchema`**
  — the Phase-0 versions were `z.any()`-wide and would accept almost any
  payload. Rewritten in-place under `.strict()` to match the live response
  on `demo-northstar-2026`. The backward-compatible aliases
  `TenantDetailSchema` → `TenantDetailResponseSchema` preserve any
  pre-Phase-4 call sites (the original hand-written aliases were the
  only call site, and they're gone after Group 4c lands).

### Hand-written because shared-types is too thin (finding #37)

- **`TenantRowSchema`** — the raw Prisma row returned by every mutation
  endpoint (approve / reject / suspend / reactivate / updateTenant
  PATCH). Covers all 32 row fields including the `approvedAt/By`,
  `rejectedAt/Reason`, `suspendedAt/By/Reason`, `reactivatedAt/By`,
  `trialStartedAt/EndsAt`, `planAssignedAt/By`, `fleetLimitWarning`,
  `jobsPaused*` metadata. `.strict()`.

---

## Phase 4 Group 4d notes (2026-04-20)

Phase 4 Group 4d rewrites the user schemas (originally `z.any()`-wide
Phase-0 placeholders) and introduces the invitation schemas (seven new
shapes — none existed in shared-types). Finding #38.

### Replaced in place (Phase-0 placeholders → tightened live schemas)

- **`UserListItemSchema`** — the Phase-0 version declared fields that
  don't appear on the live `GET /users` response (`id`, `phone`,
  `updatedAt`, `phoneVerified`) and marked nearly everything nullable or
  `z.any()`. Rewritten in place against the live projection (11 fields:
  `userId`, `email`, `firstName`, `lastName`, `role`, `isActive`,
  `emailVerified`, `createdAt`, `lastLoginAt`, `tenant` thin nested,
  `driver` thin-or-null). `.strict()` top-level + on every nested.
- **`UserListRowSchema`** — new name for the same shape; preferred by
  Group 4d callers. `UserListItemSchema` is kept as a back-compat
  alias so any pre-Phase-4 caller continues to compile.
- **`UserDetailSchema`** — the Phase-0 version extended the list shape
  with `z.any().nullable()` for `tenant` / `driver`. Rewritten in place
  to embed the full `TenantRowSchema` + a `UserDetailDriverSchema` that
  covers the observed Prisma Driver-row fields. The nested driver row
  intentionally does NOT carry `.strict()` — the Driver model drifts
  across migrations faster than a platform spec can track; the User-
  side surface (what Group 4d asserts) remains `.strict()`.

### Hand-written because shared-types is missing / thin (finding #38)

- **`UserCreateResponseSchema`** — the `POST /users` projection DROPS
  `emailVerified` / `createdAt` / `lastLoginAt` / `driver` (a freshly-
  created user has none of those). Modelled separately to prevent
  assertion false-positives on reads of the create response.
- **`UserUpdateResponseSchema`** — the `PATCH /users/:userId` projection
  DROPS `emailVerified` / `createdAt` / `lastLoginAt` but INCLUDES
  `driver` (nullable). Third User shape — distinct from both create
  (no driver) and detail (has the three timestamp/verification fields).
- **`UserMessageResponseSchema`** — `{message: string}`. Shared by
  activate / deactivate / DELETE. Dedicated schema because the rubric
  requires `expectContract` on every response, not just JSON rows.
- **`UserInvitationRowSchema`** — the bare Prisma row returned by
  `DELETE /invitations/:id` (cancel). 19 fields; `.strict()`.
- **`UserInvitationCreateResponseSchema`** — `POST /invitations` returns
  the row + `tenant` (TenantRowSchema) + `invitedByUser` (the FULL
  Prisma User row — 24 fields, all nullable auth metadata exposed) +
  a synthesised `inviteLink`. The full invited-by user row is
  necessary because the include is unprojected — no `select:` clause.
- **`UserInvitationListItemSchema`** — `GET /invitations` row + thin
  `invitedByUser` + nullable thin `driver` project. Thin projections
  use `select:` — four fields on `invitedByUser`, two on `driver`.
- **`PublicInvitationLookupSchema`** — `GET /invitations/by-token/:token`
  (public). Prisma row + thin `tenant` (tenantId/companyName/subdomain)
  - thin `invitedByUser` (firstName/lastName/email). Shape intended for
    the acceptance page so the user sees which org they're joining.
- **`AcceptInvitationResponseSchema`** — `POST /invitations/accept`
  (public). Returns the newly-created FULL User Prisma row + `tenant`
  (TenantRowSchema) + `driver` (nullable; Prisma row) + `customer`
  (nullable; Prisma row). The driver / customer projections are
  `z.any().nullable()` because those rows are model-drift-prone
  (same reasoning as `UserDetailDriverSchema`).
- **`UserInvitationResendResponseSchema`** — `POST /invitations/:id/resend`
  — Prisma row + `inviteLink`, no relations.
- **`UserInvitationLinkSchema`** — `GET /invitations/:id/link` —
  `{inviteLink}` single-field envelope.

## Phase 4 Group 4e notes (2026-04-20)

Phase 4 Group 4e adds the plans + announcements schemas. Shared-types
ships `plans.schema.ts` but the live responses drift; `broadcasts` /
`announcements` have NO shared-types coverage at all.

### Hand-written because shared-types is missing / drifts (finding #39)

- **`PlanConfigResponseSchema`** — the shape of every row in `GET /plans`
  and the `planConfig` nested inside `/my-plan` + `/tenant/:id`.
  Shared-types `PlanConfigSchema` MISSES three Prisma-row fields that
  the live response serialises: `isActive`, `createdAt`, `updatedAt`.
  The `entitlements` projection (feature/displayName/enabled) matches
  `PlanEntitlementSchema` but is composed `.strict()` locally.
- **`PlanConfigBareSchema`** — returned by `PATCH /plans/:plan` and
  `PATCH /plans/:plan/provider-price`. Same 17-field shape as
  `PlanConfigResponseSchema` MINUS the `entitlements` array (the
  service's `planConfig.update()` has no include clause).
- **`PlanEntitlementRowSchema`** — returned by
  `PATCH /plans/:plan/entitlements/:feature`. 8 fields (raw Prisma
  `plan_entitlements` row incl. `id`, `plan`, `type`, `createdAt`,
  `updatedAt`). Shared-types `PlanEntitlementSchema` has only 3 fields
  (the projection used by `GET /plans`).
- **`TenantPlanDetailsResponseSchema`** — returned by both
  `GET /plans/my-plan` and `GET /plans/tenant/:tenantId`. Shared-types
  `TenantPlanDetailsSchema` declares the 11 top-level fields correctly
  but uses its own `PlanConfigSchema` + `PlanEventSchema` for the two
  nested objects, both of which drift (see below). Re-composed locally.
- **`TenantPlanEventSchema`** (private — used inside the details
  schema) — shared-types `PlanEventSchema` MISSES `tenantId` which the
  live row exposes. Hand-written locally.

### Hand-written because there is no shared-types coverage

- **`AnnouncementRowBareSchema`** — Prisma `announcements` row MINUS
  the `createdBy` include. Returned by `POST /admin/broadcasts/:id/publish`
  and `POST /admin/broadcasts/:id/archive` — the service's
  `prisma.announcement.update` on those transitions has no `include`
  clause, so the response is the bare row.
- **`AnnouncementAdminRowSchema`** — Prisma row + `createdBy` thin user
  projection (4 fields). Returned by GET list, GET detail, POST create,
  and PATCH update.
- **`AnnouncementAdminListItemSchema`** — alias (list returns an array
  of `AnnouncementAdminRowSchema`).
- **`BroadcastActiveItemSchema`** — 8-field projection returned by
  `GET /broadcasts/active`. The service uses a hand-picked `select:`
  clause that drops `status`, `createdById`, `createdAt`, `updatedAt`,
  and the `createdBy` relation.

### PartialType DTO quirk (documented in finding #39)

`UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto)`.
Defaults on the Create DTO (`targetType = ALL`, `targetIds = []`,
`priority = INFO`) are silently applied to PATCH bodies when the
fields are undefined, which silently RESETS those fields on every
partial update that omits them. The Group 4e PATCH test asserts the
observed post-PATCH shape (ALL-targeted, empty targetIds) to pin the
quirk — callers who want targeted multi-field updates MUST provide
every field they care about in the PATCH body.

---

### Invitation accept flow — a note on Firebase verification

The accept endpoint DTO declares `firebaseUid: @IsNotEmpty()` but the
service writes the uid to the new User row as an opaque string. The
Firebase Admin SDK is NOT invoked on the accept path (no
`verifyIdToken`, no downstream Firebase call). Tests can emit a
pseudo-uid (`qa-fb-${nonce}`) and the happy-path runs end-to-end.
This observation is stable across dev/stg — verified against
`acceptInvitation` in `user-invitations.service.ts` (2026-04-20).

- **`TenantListItemSchema`** — `TenantRowSchema` + nested
  `users: TenantEmbeddedUserSchema[]` + `_count: TenantCountSchema`.
  `.strict()` top-level and on every nested object.
- **`TenantDetailResponseSchema`** — the envelope `{ tenant, users,
metrics }` returned by `GET /tenants/:tenantId/details`. NOT the raw
  row — the service manually cherry-picks fields. Critical difference:
  `approvedAt/rejectedAt/suspendedAt/reactivatedAt` are `.optional()`
  (not `.nullable()`) because the service uses `?.toISOString()` which
  OMITS the field when the timestamp is null.
- **`TenantBrandingProjectionSchema`** — `{ companyName, logoUrl }`. Not
  the entire branching response — the null branch (tenant unknown / not
  ACTIVE) is serialised by Nest as an empty 200 body, which is asserted
  via `res.text().length === 0` in the spec rather than a schema parse.
- **`TenantRegisterResponseSchema`** — `{ tenantId, status, message }`
  envelope from `POST /tenants/register`. Reserved for the happy-path
  register test (auto-excluded today per `@requires:data-tenant-register-bypass`).
- **`TenantRegisterValidationErrorSchema`** — the `ValidationPipe` 400
  envelope `{ statusCode, timestamp, path, method, detail, fieldErrors }`.
  This is the `ApiException` middleware output — NOT in shared-types and
  not a tenants-specific shape (every Nest validation 400 matches it).
  Declared here because the tenants register empty-body test is the
  first Phase-4 spec to pin the shape. Candidate for promotion to
  `packages/test-utils/src/schemas/helpers.ts` when a second spec hits.

---

## Phase 4 Group 4f notes (2026-04-20)

Phase 4 Group 4f covers the add-on surface — three controllers, 17 tests.
Shared-types has ZERO schemas for this domain today (verified 2026-04-20
— no `add-on.schema.ts`, no `tenant-add-on.schema.ts`, no
`add-on-request.schema.ts` anywhere in `packages/shared-types/src/`).
Every Phase-4f shape is hand-written locally. Finding #40.

### Hand-written because shared-types has no coverage

- **`AddOnPricingRowSchema`** — 15-field projection from the public
  `GET /add-ons` endpoint. The service's `getAddOnsForPricingPage` uses a
  hand-picked `select:` clause that deliberately drops `createdAt` /
  `updatedAt`. Consumer: public pricing page + marketing site.
- **`AddOnCatalogRowSchema`** — full 17-field Prisma `AddOn` row returned
  by `GET /admin/add-ons` and all admin catalog PATCH paths. Superset of
  `AddOnPricingRowSchema` + timestamps.
- **`TenantAddOnRowBareSchema`** — 19-field Prisma `TenantAddOn` row
  without the `addOn` include. Returned by every mutation endpoint
  (activate / cancel / overage / admin enable / admin cancel / approve /
  admin activate). The service calls `prisma.tenantAddOn.update/upsert`
  directly on those paths — no include clause.
- **`TenantAddOnRowSchema`** — `TenantAddOnRowBareSchema` + `addOn:
AddOnCatalogRowSchema` include. Returned by the three list endpoints
  that use `include: { addOn: true }`.
- **`AddOnStatusSchema`** — 5-field envelope returned by
  `GET /add-ons/:slug/status`. Flattens the `FeatureResolution` type
  (`{enabled, source, usageRemaining?}`) next to `addOn` + `tenantAddOn`.
  `usageRemaining` is `.optional()` because the service only sets it
  when `source === 'addon_active'`.
- **`AddOnRequestRowBareSchema`** — 13-field Prisma `AddOnRequest` row
  without relations. Returned by `POST /admin/add-on-requests/:id/decline`
  (the decline path has no include clause).
- **`AddOnRequestWithAddOnSchema`** — `AddOnRequestRowBareSchema` +
  `addOn: AddOnCatalogRowSchema`. Returned by `POST /add-ons/:slug/request`
  and `GET /add-ons/my-requests`.
- **`AddOnRequestAdminRowSchema`** — row + `addOn` + thin `tenant` +
  service-synthesised `addOnActive: boolean`. Returned by
  `GET /admin/add-on-requests[?status=...]`.

### Payment-system feature-flag interplay (documented in finding #40)

The self-service `POST /add-ons/:slug/activate` endpoint is gated by the
global `payment_system` feature flag:

- When `payment_system=true` (default in dev), activation tries to
  create a Stripe subscription item. For add-ons with a null
  `providerPriceId` the service throws 400 with the message
  `Add-on '<slug>' does not have a Stripe price configured`; for
  add-ons with an existing Stripe subscription item it throws a
  different 400 citing the Stripe `duplicate price` error; for add-ons
  where the Stripe call succeeds the DB row is rolled back to
  `cancelled` only if Stripe later rejects, otherwise the state lands
  `active`.
- When `payment_system=false`, the Stripe sync is a no-op and the DB
  transitions cleanly. The QA tests that exercise activate / request /
  approve toggle the flag OFF in `test.beforeAll` and restore it in
  `test.afterAll` so the round-trip is deterministic.

Two consequences for the QA suite:

1. The self-service tests live under `test.describe.configure({ mode:
'serial' })` and wrap the flag toggle in beforeAll/afterAll. Parallel
   execution with other specs that rely on `payment_system=true` is not
   supported for this block.
2. The approve-request admin test (`add-ons-admin.spec.ts` test 8) also
   runs inside the `payment_system=false` serial window, because
   `approveRequest` internally calls `activateAddOn` which would otherwise
   hit the same Stripe check.

See finding #40 in `.docs/plans/2026-04-17-qa-coverage/findings.md`
for the full payment-system / Stripe-price / activation state matrix.

---

## Phase 4 Group 4g notes (2026-04-20)

Phase 4 Group 4g covers the OAuth surface — two controllers, 10 tests.
Shared-types ships `OAuthClientResponseSchema` / `OAuthClientCreatedResponseSchema`
on the admin CRUD side; the RFC-compliant provider endpoints (register /
authorize / token / revoke) have ZERO shared-types response coverage.
Hand-written locally. Finding #41.

### Partially aligned with shared-types (hand-written for `.strict()`)

- **`OAuthClientSchema`** — 1:1 with shared-types `OAuthClientResponseSchema`
  (8 fields: `clientId`, `name`, `description`, `redirectUris`, `scopes`,
  `clientType`, `isActive`, `createdAt`). Re-composed locally because the
  shared-types schema is non-strict, so using it directly would permit
  silent field drift. `.strict()` at the call site of the compiled
  version turns out to still allow extra keys because `.strict()` on a
  runtime-constructed schema only applies to the immediate call — cleaner
  to redeclare under `.strict()` here.

- **`OAuthClientCreatedResponseSchema`** — shared-types version extends
  the base with `clientSecret` but the shared-types base is non-strict.
  Redeclared locally under `.strict()` so a stray field leak (e.g. an
  accidentally serialised `tenantId`) fails the contract assertion.

### Hand-written because shared-types has no coverage (finding #41)

- **`OAuthDCRResponseSchema`** — RFC 7591 Dynamic Client Registration
  response. snake_case wire idiom; 8 fields (7 always-present + the
  confidential-only `client_secret` / `client_secret_expires_at` pair).
  The `scope` field is a space-delimited string (RFC 7591 §3.2.1) — the
  service emits the full `OAUTH_SCOPES` list when the caller omits
  `scope` on the register request. `client_secret` is `.optional()`
  because public clients (`token_endpoint_auth_method: none`) receive
  no secret. `.strict()` rejects any other fields.

- **`OAuthRevokeResponseSchema`** — RFC 7009 §2.2 requires HTTP 200
  with empty body on success (always, to prevent token enumeration).
  The platform controller returns `{}` (empty object). Schema is
  `z.object({}).strict()` so any accidental leak (e.g. the revoked
  token id, the revocation timestamp) fails the contract.

- **`OAuthErrorResponseSchema`** — The platform's `HttpExceptionFilter`
  envelope, preserving the RFC `{error, error_description}` keys when
  the controller throws `BadRequestException({error, error_description})`
  with a structured object payload (vs the Nest default
  `{error: 'Bad Request', message: '<msg>'}` when the throw is a
  string). 8 fields, four of them `.optional()` so the schema accepts
  both RFC-structured and Nest-default 400s. Phase 4g tests assert the
  specific `error` value inline (semantic expectation); the schema
  holds the envelope shape.

### PKCE + code verifier — handled in factory

The authorize + token factories share a known-good PKCE pair:

- `OAUTH_PKCE_VERIFIER` = 43-char ASCII string.
- `OAUTH_PKCE_CHALLENGE` = `base64url(sha256(verifier))` — 43 chars.

Stored as module constants so the verifier + challenge round-trip
across both `buildOAuthAuthorizeParams` (challenge in the authorize
request) and `buildOAuthTokenBody` (verifier on the token exchange).
The token exchange itself is out-of-scope for Phase 4g (requires a
real consent-page approval), but the factory keeps them paired for
future Phase 6/8 specs.

### Redirect URIs — RFC 7591 §2 validation quirk

The service rejects redirect URIs that are neither HTTPS nor
localhost / 127.0.0.1 (MCP spec 2025-03-26 §7.1). Factories default
to `http://localhost:3000/oauth/callback` so both admin CRUD AND
RFC register paths accept the same value. Tests that want to
exercise the rejection path override `redirect_uris` with an
`https://example.invalid` or an explicit `http://bad-host.test`.

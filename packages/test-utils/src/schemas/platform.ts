/**
 * API Contracts for Platform domain endpoints.
 *
 * Existing coverage: users, tenants, api-keys (Phase 0).
 *
 * Phase 4 Group 4a additions (public surface + self-service prefs):
 *   - Reference data (1 schema, hand-written — `sort_order` drift vs shared-types).
 *   - Feature flags (3 schemas — public list + single + enabled-only).
 *   - Onboarding status (re-exports shared-types).
 *   - Settings: user prefs + super-admin prefs (GET / PUT response shapes —
 *     mostly align with shared-types but surface extra timestamps + Prisma
 *     row shape on PUT).
 *
 * Phase 4 Group 4b additions (feedback + api-keys):
 *   - Feedback has FIVE wire shapes depending on the endpoint:
 *       1. FeedbackRowSchema — full Prisma row returned by POST /feedback
 *          (create) and the admin `PATCH /:id/*` transitions. Includes
 *          `tenantId`, `userId`, `note`, `resolvedBy`, `updatedAt`.
 *       2. FeedbackOwnRowSchema — trimmed projection on GET /feedback
 *          (user's own list). Drops `tenantId`, `userId`, `note`,
 *          `resolvedBy`, `resolvedAt`, `updatedAt`.
 *       3. FeedbackAdminRowSchema — FeedbackRowSchema + nested `user`,
 *          `tenant`, `resolver` relations (returned by `GET /admin/feedback`
 *          list, `GET /admin/feedback/:id` detail).
 *       4. FeedbackListEnvelopeSchema — pagination envelope `{data, total,
 *          page, limit}` around admin rows.
 *       5. FeedbackStatsSchema — admin dashboard stats (`total` +
 *          status counts + `bySentiment`).
 *
 *     Shared-types `FeedbackSchema` exists but drifts from all five live
 *     shapes: it misses `tenantId`, `userId`, `resolvedBy`, `updatedAt` on
 *     the core row and models the admin relations as optional on the BASE
 *     schema rather than in a dedicated admin variant. Hand-written here
 *     under `.strict()` for tight contracts — finding #36.
 *
 *   - ApiKeySchema / CreateApiKeyResponseSchema — existing Phase-0 versions
 *     describe a different API (`keyId`, `prefix`). Live response matches
 *     shared-types `ApiKeyResponseSchema` exactly — replaced in place, not
 *     re-exported (so the original export names survive). Finding #36.
 *
 */
import { z } from 'zod';
import {
  FeatureFlagSchema as SharedFeatureFlagSchema,
  FeatureFlagsResponseSchema as SharedFeatureFlagsResponseSchema,
  FeatureFlagEnabledResponseSchema as SharedFeatureFlagEnabledResponseSchema,
  OnboardingStatusResponseSchema as SharedOnboardingStatusResponseSchema,
  AgentScopeSchema,
} from '@app/shared-types';
import { dbId, stringId, isoDateString } from './helpers.js';

// Note: `SuperAdminPreferencesSchema` is NOT exported from shared-types —
// hand-written below.

// ── USERS (Phase 4 Group 4d — tightened from Phase-0 placeholders) ───
//
// Schemas cover the GET /users list (projected list-row shape),
// GET /users/:userId detail (list-row + full Prisma tenant row),
// POST /users create (list-row + full tenant row), and
// PATCH /users/:userId update (list-row + full tenant row).
//
// Live shape map:
//
//   GET /users            → UserListRowSchema[]    — list projection incl. nested `{tenantId, companyName}`.
//   GET /users/:userId    → UserDetailSchema       — list-row + full Prisma tenant row (TenantRowSchema).
//   POST /users           → UserCreateResponseSchema — list-row + full Prisma tenant row (no `emailVerified`, no `createdAt`, no `lastLoginAt`).
//   PATCH /users/:userId  → UserDetailSchema       — same as GET /users/:userId.
//   POST /users/:userId/{activate,deactivate} → `{message: string}`.
//   DELETE /users/:userId → `{message: string}`.
//
// `tenant` nested on detail/create/patch is the full `TenantRowSchema`
// (declared further down in this file). To avoid a forward-reference
// loop, the user schemas below accept an `z.any()` fallback only where
// the test must parse BEFORE TenantRowSchema is in scope — but since
// both live in the same module and are declared in the right order
// (tenant row declared before user-detail below via module reorg), we
// reference `TenantRowSchema` directly. Hand-written to hold `.strict()`
// on each nested relation.

/** `GET /users` list row — thin projection. */
export const UserListRowSchema = z
  .object({
    userId: stringId,
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string(),
    isActive: z.boolean(),
    emailVerified: z.boolean(),
    createdAt: isoDateString,
    lastLoginAt: isoDateString.nullable(),
    tenant: z
      .object({
        tenantId: stringId,
        companyName: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();

/**
 * Back-compat alias — the Phase-0 name `UserListItemSchema` is still
 * exported so any pre-Phase-4 caller continues to compile. Group 4d uses
 * `UserListRowSchema` by preference.
 */
export const UserListItemSchema = UserListRowSchema;

// ── TENANTS (Phase 4 Group 4c — tenants.spec.ts) ─────────────────────
//
// The original Phase-0 `TenantListItemSchema` / `TenantDetailSchema` /
// `SubdomainCheckSchema` were wide `z.any()` placeholders — they would
// accept almost any shape, which is exactly what the rubric forbids
// (`.strict()` everywhere). Group 4c rewrites them against the live
// `GET /tenants`, `GET /tenants/:tenantId/details`, `GET /tenants/check-
// subdomain`, `GET /tenants/branding`, `POST /tenants/:id/approve |
// /reject | /suspend | /reactivate`, and `PATCH /tenants/:tenantId`
// responses of the platform tenants controller.
//
// Schema map:
//   - `TenantListItemSchema` — `GET /tenants[?status=...]` row. List items
//     carry the full Prisma row + nested owner/admin `users` + `_count`.
//   - `TenantDetailResponseSchema` — `GET /tenants/:tenantId/details`. A
//     projected envelope `{ tenant, users, metrics }` — NOT the raw row.
//   - `TenantRowSchema` — the raw Prisma row returned by the mutation
//     endpoints (approve / reject / suspend / reactivate / updateTenant
//     PATCH). Shape matches a list item MINUS the `users` + `_count`
//     nested objects (those are `include`d only on list).
//   - `SubdomainCheckSchema` — `{ available: boolean }`.
//   - `TenantBrandingSchema` — `{ companyName, logoUrl }` when active,
//     `null` for non-existent / non-ACTIVE subdomains. Branching shape
//     — service returns EITHER the object OR literal null (serialised
//     as empty body by Nest). Hand-written with `z.union`.
//   - `TenantRegisterResponseSchema` — `POST /tenants/register` — thin
//     envelope `{ tenantId, status, message }`. Only used when the
//     register-happy-path test runs (`data-tenant-register-bypass`).
//
// Shared-types provides paper-thin `TenantDetailsSchema` /
// `TenantListItemSchema` / `TenantListResponseSchema` — all missing the
// status/approval/rejection/suspension metadata the live API returns.
// Hand-written here.
//
// Shape notes:
//   - `status` is the `TenantStatus` enum (`PENDING_APPROVAL | ACTIVE |
//     SUSPENDED | REJECTED`).
//   - `plan` is the `TenantPlan` enum (string on the wire).
//   - `isActive: boolean` is distinct from `status === 'ACTIVE'` (it's
//     the join flag the guards read).
//   - `approved*/rejected*/suspended*/reactivated*` fields are mutually
//     exclusive in practice but all declared as `nullable()` on the row.
//   - `jobsPaused*` are job-control flags on the row.

const TenantEmbeddedUserSchema = z
  .object({
    userId: stringId,
    email: z.string(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    role: z.string(),
  })
  .strict();

const TenantCountSchema = z
  .object({
    users: z.number().int().nonnegative(),
  })
  .strict();

/** Raw Prisma row shape — mutation endpoints (approve/reject/suspend/reactivate/PATCH). */
export const TenantRowSchema = z
  .object({
    id: dbId,
    tenantId: stringId,
    companyName: z.string(),
    subdomain: z.string().nullable(),
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
    status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED']),
    approvedAt: isoDateString.nullable(),
    approvedBy: z.string().nullable(),
    rejectedAt: isoDateString.nullable(),
    rejectionReason: z.string().nullable(),
    suspendedAt: isoDateString.nullable(),
    suspendedBy: z.string().nullable(),
    suspensionReason: z.string().nullable(),
    reactivatedAt: isoDateString.nullable(),
    reactivatedBy: z.string().nullable(),
    onboardingCompletedAt: isoDateString.nullable(),
    onboardingProgress: z.any().nullable(),
    timezone: z.string().nullable(),
    deskScheduleEnabled: z.boolean(),
    aiZeroRetention: z.boolean(),
    isActive: z.boolean(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    plan: z.string(),
    trialStartedAt: isoDateString.nullable(),
    trialEndsAt: isoDateString.nullable(),
    planAssignedAt: isoDateString.nullable(),
    planAssignedBy: z.string().nullable(),
    jobsPaused: z.boolean(),
    jobsPausedAt: isoDateString.nullable(),
    jobsPausedBy: z.number().int().nullable(),
  })
  .strict();

/** `GET /tenants[?status=...]` row — Prisma row + nested `users` + `_count`. */
export const TenantListItemSchema = TenantRowSchema.extend({
  users: z.array(TenantEmbeddedUserSchema),
  _count: TenantCountSchema,
}).strict();

/**
 * `GET /tenants/:tenantId/details` envelope — a projected shape, NOT the
 * raw row. Service manually cherry-picks the row fields and embeds a
 * rich `users[]` + scalar `metrics`.
 */
const TenantDetailProjectionSchema = z
  .object({
    id: dbId,
    tenantId: stringId,
    companyName: z.string(),
    subdomain: z.string().nullable(),
    status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED']),
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
    createdAt: isoDateString,
    // approvedAt / rejectedAt / suspendedAt / reactivatedAt are conditionally
    // included — the service uses `tenant.approvedAt?.toISOString()` so the
    // field is OMITTED (not null) when the timestamp is null. That shape
    // demands `.optional()` for those four.
    approvedAt: isoDateString.optional(),
    approvedBy: z.string().nullable(),
    rejectedAt: isoDateString.optional(),
    rejectionReason: z.string().nullable(),
    suspendedAt: isoDateString.optional(),
    suspendedBy: z.string().nullable(),
    // `suspensionReason` is emitted unconditionally by the projection (the
    // service reads `tenant.suspensionReason` directly, not via optional
    // chaining — a null row serialises as `null`, not omitted).
    suspensionReason: z.string().nullable(),
    reactivatedAt: isoDateString.optional(),
    reactivatedBy: z.string().nullable(),
  })
  .strict();

const TenantDetailUserSchema = z
  .object({
    userId: stringId,
    email: z.string(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    role: z.string(),
    isActive: z.boolean(),
    lastLoginAt: isoDateString.nullable(),
  })
  .strict();

const TenantMetricsSchema = z
  .object({
    totalUsers: z.number().int().nonnegative(),
  })
  .strict();

export const TenantDetailResponseSchema = z
  .object({
    tenant: TenantDetailProjectionSchema,
    users: z.array(TenantDetailUserSchema),
    metrics: TenantMetricsSchema,
  })
  .strict();

/** Back-compat alias — the Phase-0 name `TenantDetailSchema` was used by
 *  pre-Phase-4 specs. Group 4c points at the full envelope now. */
export const TenantDetailSchema = TenantDetailResponseSchema;

/** `GET /tenants/check-subdomain/:subdomain`. */
export const SubdomainCheckSchema = z
  .object({
    available: z.boolean(),
  })
  .strict();

/**
 * `GET /tenants/branding/:subdomain`. Returns the projection when the
 * tenant exists AND is ACTIVE, otherwise `null` (serialised by Nest as an
 * empty 200 response body). Hand-written as a union + a null-sentinel
 * parser that accepts empty string OR literal `null` for the null branch.
 */
export const TenantBrandingProjectionSchema = z
  .object({
    companyName: z.string(),
    logoUrl: z.string().nullable(),
  })
  .strict();

/**
 * `POST /tenants/register` — public envelope. Gated by
 * `@requires:data-tenant-register-bypass` because dev enforces Turnstile
 * (see finding #37); the happy-path test only runs when bypass is flagged.
 */
export const TenantRegisterResponseSchema = z
  .object({
    tenantId: stringId,
    status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED']),
    message: z.string(),
  })
  .strict();

/**
 * 400 error envelope for `POST /tenants/register` with empty body. Nest's
 * `ValidationPipe` returns `{ statusCode, timestamp, path, method, detail,
 * fieldErrors }`. The fieldErrors map has a string message per field.
 * Hand-written — the envelope shape is the ApiException middleware output
 * and not in shared-types.
 */
export const TenantRegisterValidationErrorSchema = z
  .object({
    statusCode: z.literal(400),
    timestamp: isoDateString,
    path: z.string(),
    method: z.string(),
    detail: z.string(),
    fieldErrors: z.record(z.string(), z.string()),
  })
  .strict();

// ── USERS — response shapes that reference TenantRowSchema (Phase 4 Group 4d)
//
// These must follow `TenantRowSchema` (declared above) because the user
// detail / create / update responses embed the full Prisma tenant row.

/**
 * `GET /users/:userId` detail + `PATCH /users/:userId` response.
 *
 * Live shape = list-row projection + full Prisma tenant row. The service's
 * manual re-projection drops the Prisma-row numeric `id`, `tenantId`
 * (foreign-key int), and `updatedAt` so we match the observed top-level
 * keys exactly.
 */
export const UserDetailSchema = z
  .object({
    userId: stringId,
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string(),
    isActive: z.boolean(),
    emailVerified: z.boolean(),
    createdAt: isoDateString,
    lastLoginAt: isoDateString.nullable(),
    tenant: TenantRowSchema.nullable(),
  })
  .strict();

/**
 * `POST /users` create response — list-row subset + full Prisma tenant row.
 * The service's createUser projection intentionally omits
 * `emailVerified` / `createdAt` / `lastLoginAt` (those fields return on
 * the detail read).
 */
export const UserCreateResponseSchema = z
  .object({
    userId: stringId,
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string(),
    isActive: z.boolean(),
    tenant: TenantRowSchema.nullable(),
  })
  .strict();

/**
 * `PATCH /users/:userId` response — the service's updateUser projection
 * emits `{userId, email, firstName, lastName, role, isActive, tenant}`.
 * It drops `emailVerified` / `createdAt` / `lastLoginAt` (unlike detail).
 * Distinct from both — hand-written.
 */
export const UserUpdateResponseSchema = z
  .object({
    userId: stringId,
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string(),
    isActive: z.boolean(),
    tenant: TenantRowSchema.nullable(),
  })
  .strict();

/**
 * `POST /users/:userId/activate`, `POST /users/:userId/deactivate`, and
 * `DELETE /users/:userId` all return `{ message: string }`. One shape
 * for all three — cheap schema, tight contract.
 */
export const UserMessageResponseSchema = z
  .object({
    message: z.string(),
  })
  .strict();

// ── USER INVITATIONS (Phase 4 Group 4d) ─────────────────────────────
//
// The controller mounts seven invitation endpoints. Response shapes
// (per the platform controllers/services):
//
//   POST   /invitations                         → InvitationCreatedSchema
//     — full Prisma row + `tenant` (TenantRowSchema) + `invitedByUser`
//       (full Prisma user row) + `inviteLink: string`.
//
//   GET    /invitations                         → InvitationListItemSchema[]
//     — full Prisma row + `invitedByUser` (thin projection). NO `tenant`.
//
//   GET    /invitations/by-token/:token (PUBLIC) → PublicInvitationLookupSchema
//     — full Prisma row + `tenant` (thin projection: tenantId/companyName/subdomain)
//       + `invitedByUser` (thin projection: firstName/lastName/email).
//
//   POST   /invitations/accept (PUBLIC)         → AcceptInvitationResponseSchema
//     — full Prisma user row + `tenant` (TenantRowSchema).
//
//   POST   /invitations/:id/resend              → InvitationResendSchema
//     — full Prisma row + `inviteLink`. No relations.
//
//   GET    /invitations/:id/link                → InvitationLinkSchema `{ inviteLink }`
//
//   DELETE /invitations/:id                     → InvitationRowSchema
//     — full Prisma row (no relations, no inviteLink).
//
// There is NO `GET /invitations/:id` detail endpoint. The `/link` route
// is the closest thing to "get by id" and returns only the link string.
//
// Shared-types `@app/shared-types/platform/user.schema.ts::InviteUserSchema`
// covers only the request-side body (4 fields); no response schemas exist.

/** Core Prisma row — shared by every invitation response. */
const UserInvitationPrismaRowProjection = {
  id: dbId,
  invitationId: stringId,
  tenantId: dbId,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  inviteChannel: z.enum(['EMAIL', 'SMS']),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  token: z.string(),
  expiresAt: isoDateString,
  invitedBy: dbId,
  status: z.enum(['PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED']),
  acceptedAt: isoDateString.nullable(),
  acceptedByUserId: dbId.nullable(),
  cancelledAt: isoDateString.nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: isoDateString,
};

/** Bare Prisma row — returned by DELETE /invitations/:id (cancel). */
export const UserInvitationRowSchema = z.object(UserInvitationPrismaRowProjection).strict();

/**
 * `POST /invitations` response — Prisma row + two relation includes +
 * the service-synthesised `inviteLink`. The `invitedByUser` include is
 * the FULL Prisma user row (every nullable auth field); we model the
 * outer object `.strict()` but the nested user row `.passthrough()`-free
 * by typing every observed key explicitly.
 */
const InvitedByUserFullSchema = z
  .object({
    id: dbId,
    userId: stringId,
    tenantId: dbId.nullable(),
    email: z.string().nullable(),
    passwordHash: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string(),
    firebaseUid: z.string().nullable(),
    emailVerified: z.boolean(),
    phone: z.string().nullable(),
    phoneVerified: z.boolean(),
    pinHash: z.string().nullable(),
    isActive: z.boolean(),
    lastLoginAt: isoDateString.nullable(),
    passwordChangedAt: isoDateString.nullable(),
    deletedAt: isoDateString.nullable(),
    deletedBy: dbId.nullable(),
    deletionReason: z.string().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

export const UserInvitationCreateResponseSchema = z
  .object({
    ...UserInvitationPrismaRowProjection,
    tenant: TenantRowSchema,
    invitedByUser: InvitedByUserFullSchema,
    inviteLink: z.string(),
  })
  .strict();

/**
 * `GET /invitations` list-row — Prisma row + thin `invitedByUser` include.
 * No `tenant`. No `inviteLink`.
 */
const InvitedByUserListProjectionSchema = z
  .object({
    userId: stringId,
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  })
  .strict();

export const UserInvitationListItemSchema = z
  .object({
    ...UserInvitationPrismaRowProjection,
    invitedByUser: InvitedByUserListProjectionSchema,
  })
  .strict();

/**
 * `GET /invitations/by-token/:token` public lookup — Prisma row + thin
 * `tenant` projection + thin `invitedByUser` projection. Lists the
 * tenantId/companyName/subdomain needed by the accept page so the user
 * knows which org they're joining.
 */
const PublicInvitationTenantProjectionSchema = z
  .object({
    tenantId: stringId,
    companyName: z.string(),
    subdomain: z.string(),
  })
  .strict();

const PublicInvitationInvitedByProjectionSchema = z
  .object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();

export const PublicInvitationLookupSchema = z
  .object({
    ...UserInvitationPrismaRowProjection,
    tenant: PublicInvitationTenantProjectionSchema,
    invitedByUser: PublicInvitationInvitedByProjectionSchema,
  })
  .strict();

/**
 * `POST /invitations/accept` — full Prisma user row + `tenant`
 * (TenantRowSchema). The response is the newly-created User row — distinct
 * from the admin UserDetailSchema because it uses the raw Prisma-row field
 * set (numeric `id`, `tenantId`, `passwordHash`, `firebaseUid`, etc.).
 * Model the outer object `.strict()` and enumerate every observed field.
 */
export const AcceptInvitationResponseSchema = z
  .object({
    id: dbId,
    userId: stringId,
    tenantId: dbId.nullable(),
    email: z.string().nullable(),
    passwordHash: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string(),
    firebaseUid: z.string().nullable(),
    emailVerified: z.boolean(),
    phone: z.string().nullable(),
    phoneVerified: z.boolean(),
    pinHash: z.string().nullable(),
    isActive: z.boolean(),
    lastLoginAt: isoDateString.nullable(),
    passwordChangedAt: isoDateString.nullable(),
    deletedAt: isoDateString.nullable(),
    deletedBy: dbId.nullable(),
    deletionReason: z.string().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    tenant: TenantRowSchema.nullable(),
  })
  .strict();

/**
 * `POST /invitations/:id/resend` — Prisma row + `inviteLink`. No
 * relations (service doesn't re-include them after the update).
 */
export const UserInvitationResendResponseSchema = z
  .object({
    ...UserInvitationPrismaRowProjection,
    inviteLink: z.string(),
  })
  .strict();

/** `GET /invitations/:id/link` — single-field `{inviteLink}` envelope. */
export const UserInvitationLinkSchema = z
  .object({
    inviteLink: z.string(),
  })
  .strict();

// ── API KEYS (Phase 4 Group 4b — rewritten from the Phase-0 version) ──
//
// Drift note (Phase-0 → Phase-4 Group 4b): the original hand-written
// schema described a `keyId`/`prefix`/`z.number() id` API that does not
// match the current `ApiKeyDto` (see finding #36). The live response:
//   - `id` is a UUID string (Prisma `@db.Uuid`).
//   - There is no `keyId` / `prefix` field on any endpoint.
//   - `key` is returned ONLY on create (full secret, one-time), never on list.
//   - All other fields are stable + typed per shared-types `ApiKeyResponseSchema`.
//
// The live response matches `@app/shared-types` ApiKeyResponseSchema 1:1 —
// we hand-write here (instead of re-exporting) so we can layer the
// `.strict()` rule at call sites AND express the list variant (no `key`
// possible) as a distinct shape. Shared-types models `key` as `optional()`,
// which permits the value to APPEAR on list responses — it never does.

const ApiKeyBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  scopes: z.array(AgentScopeSchema),
  ipAllowlist: z.array(z.string()),
  rateLimitPerMinute: z.number(),
  isWriteEnabled: z.boolean(),
  requestCount: z.number(),
  lastUsedAt: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateString,
  expiresAt: z.string().nullable(),
});

/** Response of `GET /api-keys` list items — the full `key` must NEVER leak here. */
export const ApiKeySchema = ApiKeyBaseSchema;

/** Response of `POST /api-keys` — includes the full secret one time. */
export const CreateApiKeyResponseSchema = ApiKeyBaseSchema.extend({
  key: z.string().regex(/^sk_live_[A-Za-z0-9_-]{32}$/),
});

// ─── FEATURE FLAGS (Phase 4 Group 4a) ─────────────────────────────
//
// Re-export the shared-types schemas so we can apply `.strict()` at call
// sites. Shared-types `FeatureFlagSchema` mirrors the DTO exactly
// (key/name/description?/enabled/category) — no drift observed.

export const FeatureFlagSchema = SharedFeatureFlagSchema;
export const FeatureFlagListSchema = SharedFeatureFlagsResponseSchema;
export const FeatureFlagEnabledSchema = SharedFeatureFlagEnabledResponseSchema;

// ─── ONBOARDING (Phase 4 Group 4a) ────────────────────────────────
//
// Shared-types `OnboardingStatusResponseSchema` matches the controller's
// `OnboardingStatusResponse` interface 1:1 — use as-is with `.strict()`.

export const OnboardingStatusSchema = SharedOnboardingStatusResponseSchema;

// ─── SETTINGS — USER PREFERENCES (Phase 4 Group 4a) ───────────────
//
// Live response matches shared-types `UserPreferencesSchema` except that
// `platformTourStatus` is nullable on fresh rows (`null` until the user
// dismisses or completes the tour). Shared-types already declares it as
// `.nullable().optional()`. Hand-written locally so we can layer
// `.strict()` cleanly.

export const UserPreferencesSchema = z.object({
  id: dbId,
  userId: dbId,
  distanceUnit: z.string(),
  timeFormat: z.string(),
  timezone: z.string(),
  dateFormat: z.string(),
  alertChannels: z.record(z.string(), z.any()),
  soundSettings: z.record(z.string(), z.boolean()),
  notificationPreferences: z.any().nullable().optional(),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().nullable(),
  quietHoursEnd: z.string().nullable(),
  platformTourStatus: z.enum(['dismissed', 'completed']).nullable().optional(),
  platformTourStatusAt: z.string().nullable().optional(),
  voiceMode: z.string(),
  voiceId: z.string(),
  voiceSpeed: z.string(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

// ─── SETTINGS — SUPER ADMIN PREFERENCES (Phase 4 Group 4a) ────────
//
// No shared-types equivalent. Controller returns just three fields —
// the service projects the Prisma row, dropping id/userId/timestamps.

export const SuperAdminPreferencesSchema = z.object({
  notifyNewTenants: z.boolean(),
  notifyStatusChanges: z.boolean(),
  notificationFrequency: z.enum(['immediate', 'daily']),
});

// ─── FEEDBACK (Phase 4 Group 4b) ──────────────────────────────────
//
// See file-header docstring for the shape matrix. All shapes are
// hand-written because shared-types `FeedbackSchema` is missing the
// `tenantId`, `userId`, `resolvedBy`, `updatedAt` fields that the live
// Prisma-row payloads carry. Finding #36.

/** Enums (matches shared-types, duplicated locally for `.strict()` composition). */
const FeedbackCategoryEnum = z.enum(['bug', 'idea', 'general']);
const FeedbackStatusEnum = z.enum(['new', 'reviewed', 'resolved']);

/** Core projection common to all four row variants. */
const FeedbackCoreProjection = {
  id: dbId,
  category: FeedbackCategoryEnum.nullable(),
  sentiment: z.number().int().min(1).max(5),
  message: z.string(),
  page: z.string().nullable(),
  status: FeedbackStatusEnum,
  createdAt: isoDateString,
};

/** Full Prisma row — POST /feedback and all admin PATCH transitions return this shape. */
export const FeedbackRowSchema = z.object({
  ...FeedbackCoreProjection,
  tenantId: dbId,
  userId: dbId,
  note: z.string().nullable(),
  resolvedBy: dbId.nullable(),
  resolvedAt: isoDateString.nullable(),
  updatedAt: isoDateString,
});

/** Trimmed user-facing row — GET /feedback (listOwn) drops tenant/user/resolve metadata. */
export const FeedbackOwnRowSchema = z.object({
  ...FeedbackCoreProjection,
});

/** Admin row — Prisma row + nested relations (user/tenant/resolver). */
export const FeedbackAdminRowSchema = FeedbackRowSchema.extend({
  user: z
    .object({
      id: dbId,
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
      phone: z.string().nullable(),
      role: z.string(),
    })
    .strict(),
  tenant: z
    .object({
      id: dbId,
      companyName: z.string(),
    })
    .strict(),
  resolver: z
    .object({
      id: dbId,
      firstName: z.string(),
      lastName: z.string(),
    })
    .strict()
    .nullable(),
});

/** Pagination envelope around admin rows — GET /admin/feedback. */
export const FeedbackListEnvelopeSchema = z.object({
  data: z.array(FeedbackAdminRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

/** GET /admin/feedback/stats envelope. */
export const FeedbackStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  bySentiment: z.array(
    z
      .object({
        sentiment: z.number().int().min(1).max(5),
        count: z.number().int().nonnegative(),
      })
      .strict(),
  ),
});

/** Thin tenant-summary item — GET /admin/feedback/tenants. */
export const FeedbackTenantSummarySchema = z
  .object({
    id: dbId,
    companyName: z.string(),
  })
  .strict();

/**
 * Bulk-categorize response.
 *
 * Service returns EITHER `{ categorized: 0 }` when no uncategorized rows
 * exist, OR `{ categorized, total }` when rows were processed. We model
 * `total` as optional to keep `.strict()` viable across both branches.
 * Finding #36 notes this branch drift.
 */
export const FeedbackBulkCategorizeSchema = z
  .object({
    categorized: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

// ── PLANS (Phase 4 Group 4e — plans.spec.ts) ──────────────────────────
//
// Shape map (per the platform controllers/services):
//
//   GET   /plans                                  → PlanConfigResponseSchema[]
//     — 17 fields (shared-types PlanConfigSchema misses `isActive`,
//       `createdAt`, `updatedAt`). Plus `entitlements: PlanEntitlementSchema[]`.
//   GET   /plans/my-plan                          → TenantPlanDetailsResponseSchema
//     — 11 fields including `planConfig` (nullable; same 17-field shape)
//       + `planEvents[]` (7 fields; shared-types `PlanEventSchema` is missing `tenantId`).
//   GET   /plans/tenant/:tenantId                 → TenantPlanDetailsResponseSchema
//     — same as /my-plan shape.
//   PATCH /plans/:plan                            → PlanConfigBareSchema
//     — 17 fields, NO `entitlements` (service's updatePlanConfig returns the
//       raw Prisma row without the entitlements include).
//   PATCH /plans/:plan/provider-price             → PlanConfigBareSchema
//     — same 17-field no-entitlements shape.
//   PATCH /plans/:plan/entitlements/:feature      → PlanEntitlementRowSchema
//     — 8 fields (raw Prisma row incl. `type`, `createdAt`, `updatedAt`).
//       Shared-types PlanEntitlementSchema has only {feature, displayName, enabled}.
//   PATCH /plans/tenant/:tenantId                 → TenantRowSchema (already
//     declared above for tenants.spec.ts — full Prisma row, no includes).
//
// Shared-types drift: shared-types `PlanConfigSchema` + `PlanEventSchema`
// both miss live fields — hand-written below. Finding #39.
//
// We import `TenantPlanSchema` from shared-types (the enum is stable), but
// compose everything else locally to layer `.strict()` cleanly and pin
// drifted field sets.

/**
 * Full PlanConfig row as returned by GET /plans and nested inside
 * /my-plan and /tenant/:id. Includes the `entitlements` relation projection.
 */
export const PlanConfigResponseSchema = z.object({
  id: stringId,
  plan: z.enum(['TRIAL', 'TRIAL_EXPIRED', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'SUSPENDED']),
  displayName: z.string(),
  tagline: z.string(),
  pricePerUnit: z.number().nullable(),
  unitLabel: z.string(),
  fleetLimit: z.number().nullable(),
  userLimit: z.number().nullable(),
  isPopular: z.boolean(),
  ctaLabel: z.string(),
  ctaUrl: z.string().nullable(),
  displayOrder: z.number(),
  providerPriceId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  entitlements: z.array(
    z
      .object({
        feature: z.string(),
        displayName: z.string(),
        enabled: z.boolean(),
      })
      .strict(),
  ),
});

/**
 * PlanConfig row WITHOUT the `entitlements` include — returned by
 * PATCH /plans/:plan + PATCH /plans/:plan/provider-price. The service's
 * updatePlanConfig + updateProviderPriceId call `prisma.planConfig.update()`
 * directly (no include) so the response matches the raw row.
 */
export const PlanConfigBareSchema = z.object({
  id: stringId,
  plan: z.enum(['TRIAL', 'TRIAL_EXPIRED', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'SUSPENDED']),
  displayName: z.string(),
  tagline: z.string(),
  pricePerUnit: z.number().nullable(),
  unitLabel: z.string(),
  fleetLimit: z.number().nullable(),
  userLimit: z.number().nullable(),
  isPopular: z.boolean(),
  ctaLabel: z.string(),
  ctaUrl: z.string().nullable(),
  displayOrder: z.number(),
  providerPriceId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

/**
 * Raw Prisma `plan_entitlements` row — returned by
 * PATCH /plans/:plan/entitlements/:feature. 8 fields including `type` +
 * timestamps that shared-types `PlanEntitlementSchema` omits.
 */
export const PlanEntitlementRowSchema = z.object({
  id: stringId,
  plan: z.enum(['TRIAL', 'TRIAL_EXPIRED', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'SUSPENDED']),
  feature: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  type: z.string(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

/**
 * TenantPlanEvent row — nested inside the TenantPlanDetails response.
 * Live response includes `tenantId` which shared-types `PlanEventSchema`
 * omits. Finding #39.
 */
const TenantPlanEventSchema = z
  .object({
    id: stringId,
    tenantId: stringId,
    fromPlan: z.string().nullable(),
    toPlan: z.string(),
    changedBy: z.string(),
    reason: z.string().nullable(),
    createdAt: isoDateString,
  })
  .strict();

/**
 * TenantPlanDetails envelope — returned by GET /plans/my-plan and
 * GET /plans/tenant/:tenantId. `planConfig` is nullable (it's null when
 * the tenant plan is TRIAL_EXPIRED or another plan without a config row).
 * `planEvents` is always an array, up to 10 rows, descending by createdAt.
 */
export const TenantPlanDetailsResponseSchema = z
  .object({
    plan: z.enum(['TRIAL', 'TRIAL_EXPIRED', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'SUSPENDED']),
    trialStartedAt: isoDateString.nullable(),
    trialEndsAt: isoDateString.nullable(),
    planAssignedAt: isoDateString.nullable(),
    planAssignedBy: z.string().nullable(),
    planConfig: PlanConfigResponseSchema.nullable(),
    userCount: z.number().int().nonnegative(),
    seatLimit: z.number().nullable(),
    daysLeftInTrial: z.number().nullable(),
    planEvents: z.array(TenantPlanEventSchema),
  })
  .strict();

// ── ANNOUNCEMENTS (Phase 4 Group 4e — announcements.spec.ts) ──────────
//
// Shape map (probed 2026-04-20):
//
//   GET   /admin/broadcasts[?status=...]    → AnnouncementAdminListItemSchema[]
//     — Prisma row + `createdBy` thin user projection (4 fields).
//   GET   /admin/broadcasts/:id             → AnnouncementAdminRowSchema
//     — same as list-item shape.
//   POST  /admin/broadcasts                 → AnnouncementAdminRowSchema
//     — same shape.
//   PATCH /admin/broadcasts/:id             → AnnouncementAdminRowSchema
//     — same shape (service re-includes createdBy on update).
//   POST  /admin/broadcasts/:id/publish     → AnnouncementRowBareSchema
//     — row MINUS the `createdBy` relation (publish/archive do NOT re-include).
//   POST  /admin/broadcasts/:id/archive     → AnnouncementRowBareSchema
//     — same minus-createdBy shape.
//   GET   /broadcasts/active                → BroadcastActiveItemSchema[]
//     — thin projection: `id, title, body, priority, publishedAt, expiresAt,
//       targetType, targetIds` (8 fields, no createdBy, no status, no timestamps).
//
// `targetType` enum: ALL | PLAN | TENANT.
// `priority` enum: INFO | WARNING | CRITICAL.
// `status` enum: DRAFT | PUBLISHED | ARCHIVED.
//
// No shared-types equivalents — every shape is hand-written. Finding #39.

const AnnouncementTargetTypeEnum = z.enum(['ALL', 'PLAN', 'TENANT']);
const AnnouncementPriorityEnum = z.enum(['INFO', 'WARNING', 'CRITICAL']);
const AnnouncementStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

const AnnouncementCreatedBySchema = z
  .object({
    id: dbId,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();

/**
 * Raw Prisma `announcements` row WITHOUT the `createdBy` include. Returned
 * by publish + archive endpoints (the service's `prisma.announcement.update`
 * has no include clause on those transitions).
 */
export const AnnouncementRowBareSchema = z
  .object({
    id: dbId,
    title: z.string(),
    body: z.string(),
    targetType: AnnouncementTargetTypeEnum,
    targetIds: z.array(z.string()),
    status: AnnouncementStatusEnum,
    priority: AnnouncementPriorityEnum,
    publishedAt: isoDateString.nullable(),
    expiresAt: isoDateString.nullable(),
    createdById: dbId,
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

/**
 * Announcement row + the `createdBy` include — returned by the admin list
 * rows, detail GET, create POST, and update PATCH.
 */
export const AnnouncementAdminRowSchema = AnnouncementRowBareSchema.extend({
  createdBy: AnnouncementCreatedBySchema,
}).strict();

/** Alias — the list endpoint returns an array of the same admin-row shape. */
export const AnnouncementAdminListItemSchema = AnnouncementAdminRowSchema;

/**
 * Public `/broadcasts/active` projection — the service's
 * `fetchAllActiveAnnouncements` uses a hand-picked `select:` clause that
 * drops `status`, `createdAt`, `updatedAt`, `createdById`, and of course
 * the `createdBy` relation. 8 fields total.
 */
export const BroadcastActiveItemSchema = z
  .object({
    id: dbId,
    title: z.string(),
    body: z.string(),
    priority: AnnouncementPriorityEnum,
    publishedAt: isoDateString.nullable(),
    expiresAt: isoDateString.nullable(),
    targetType: AnnouncementTargetTypeEnum,
    targetIds: z.array(z.string()),
  })
  .strict();

// ── OAUTH (Phase 4 Group 4g — oauth.spec.ts) ──────────────────────────────
//
// TWO wire idioms, two response shape families:
//
//   Admin CRUD (`/oauth/clients/*`, tenant-scoped CRUD, camelCase):
//     - GET    /oauth/clients              → OAuthClientResponseSchema[]
//     - POST   /oauth/clients              → OAuthClientCreatedResponseSchema (secret ONCE)
//     - GET    /oauth/clients/:clientId    → OAuthClientResponseSchema
//     - PUT    /oauth/clients/:clientId    → OAuthClientResponseSchema
//     - DELETE /oauth/clients/:clientId    → 204 no-body (no schema)
//
//   RFC public (`/oauth/*`, RFC 6749/7009/7591, snake_case):
//     - POST   /oauth/register             → OAuthDCRResponseSchema (RFC 7591)
//     - GET    /oauth/authorize            → 302 Location header (no body schema)
//     - POST   /oauth/token                → (out of scope — consent flow required)
//     - POST   /oauth/revoke               → OAuthRevokeResponseSchema (RFC 7009, always 200 `{}`)
//     - GET    /oauth/authorize (error)    → OAuthErrorResponseSchema (Nest 400 envelope + RFC keys)
//
// Drift from shared-types (documented in finding #41):
//   - shared-types `OAuthClientResponseSchema` / `OAuthClientCreatedResponseSchema`
//     match 1:1 with the live admin CRUD responses — re-composed locally with
//     `.strict()` to catch field drift (the shared-types versions are non-strict).
//   - shared-types has NO RFC 7591 DCR response schema. The register endpoint
//     synthesises its own wire shape (snake_case, different field set for
//     public vs confidential clients). Hand-written below.
//   - shared-types has NO RFC 7009 / RFC 6749 error-envelope schemas. The
//     live error envelope is the platform `HttpExceptionFilter` envelope
//     (`{statusCode, timestamp, path, method, detail, error?, error_description?,
//     message?}`) which preserves the RFC `{error, error_description}` keys
//     when the controller throws `BadRequestException({error, error_description})`.
//     Hand-written below — same shape also matches the revoke 200 `{}` body.

/**
 * Admin-visible OAuth client row (list + detail + update). Hand-written
 * locally under `.strict()` — shared-types `OAuthClientResponseSchema`
 * exists but is non-strict so we can't use it directly without wrapping.
 * 8 fields; no client_secret (secret is returned ONCE on create only).
 */
export const OAuthClientSchema = z
  .object({
    clientId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    redirectUris: z.array(z.string()),
    scopes: z.array(z.string()),
    clientType: z.enum(['confidential', 'public']),
    isActive: z.boolean(),
    createdAt: isoDateString,
  })
  .strict();

/** Alias — `GET /oauth/clients` returns an array of these. */
export const OAuthClientListItemSchema = OAuthClientSchema;

/**
 * POST /oauth/clients response — includes the plaintext `clientSecret`
 * exactly once. Consumers MUST assert the secret presence in-memory and
 * never leak it to the test-run trace (Playwright traces include request
 * bodies, so a leaked secret is a real audit concern). The spec's cleanup
 * hook deletes the client in afterEach, invalidating the secret.
 */
export const OAuthClientCreatedResponseSchema = OAuthClientSchema.extend({
  clientSecret: z.string().min(1),
}).strict();

/**
 * POST /oauth/register response — RFC 7591 Dynamic Client Registration.
 *
 * Two branches depending on `token_endpoint_auth_method`:
 *   - `none`                → public client, NO `client_secret` / `client_secret_expires_at`.
 *   - `client_secret_*`     → confidential client, `client_secret` + `client_secret_expires_at: 0`.
 *
 * `scope` is a space-delimited string (RFC 7591 §3.2.1) containing the full
 * list of OAUTH_SCOPES when the caller omits `scope` on the request. Both
 * `client_secret` and `client_secret_expires_at` are modelled `.optional()`
 * so the schema accepts both branches under `.strict()`.
 */
export const OAuthDCRResponseSchema = z
  .object({
    client_id: z.string(),
    client_name: z.string(),
    redirect_uris: z.array(z.string()),
    grant_types: z.array(z.string()),
    token_endpoint_auth_method: z.string(),
    scope: z.string(),
    client_id_issued_at: z.number().int(),
    // Only present for confidential clients (token_endpoint_auth_method != 'none').
    client_secret: z.string().optional(),
    client_secret_expires_at: z.number().int().optional(),
  })
  .strict();

/**
 * RFC 7009 revoke response. Per spec §2.2 the server MUST return HTTP 200
 * with NO body content on success; the platform controller returns an empty
 * JSON object `{}`. Schema accepts the empty-object body under `.strict()`.
 */
export const OAuthRevokeResponseSchema = z.object({}).strict();

/**
 * OAuth error envelope — the platform `HttpExceptionFilter` output when a
 * controller throws `BadRequestException({error, error_description})` with
 * a structured object payload (RFC 6749 §5.2 / §4.1.2.1 / RFC 7591 §3.2.2).
 *
 * The filter preserves the RFC keys via the `extra` spread at
 * `http-exception.filter.ts:143`, but layers them ON TOP of the platform
 * envelope (`statusCode`, `timestamp`, `path`, `method`, `detail`). The
 * `detail` field will typically be `'Request failed'` (fallback used when
 * neither `obj.detail` nor `obj.message` is set on the object payload).
 *
 * For string-form `BadRequestException('some message')` throws, the shape
 * is different: the filter emits `{error: 'Bad Request', message: '...'}`
 * (Nest default) alongside `detail` and no `error_description`. Modelled
 * `.optional()` on all four RFC/Nest keys so one schema accepts both
 * variants — each test asserts the specific key presence it expects via
 * dedicated semantic expectations.
 *
 * Also covers the RFC 7009 revoke `{error: 'invalid_token'}` branch and
 * the DCR `{error: 'invalid_client_metadata'}` branch.
 */
export const OAuthErrorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    timestamp: z.string(),
    path: z.string(),
    method: z.string(),
    detail: z.string(),
    // RFC-structured BadRequest: `{error, error_description}`.
    error: z.string().optional(),
    error_description: z.string().optional(),
    // Nest string-BadRequest: `{error: 'Bad Request', message: '<msg>'}`.
    message: z.string().optional(),
    fieldErrors: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

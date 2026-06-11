import { unique } from './common.js';

// ── User invitation / webhook / feedback (existing Phase 0/2 factories) ─────

/**
 * POST /invitations body — matches `InviteUserDto`.
 *
 * The DTO accepts `email` OR `phone` (at least one is required — enforced
 * at the service layer). Default factory emits `email`-channel invitation
 * with a fresh unique suffix so parallel test runs cannot collide on the
 * `{tenantId, email, status: PENDING}` uniqueness check. Role defaults to
 * MEMBER because OWNER/SUPER_ADMIN are rejected at the service layer,
 * ADMIN is OWNER-only, and MEMBER is the broadest, side-effect-free
 * role that can be invited by either OWNER or ADMIN.
 */
export function buildUserInvitation(overrides: Record<string, unknown> = {}) {
  return {
    email: `invite-${unique('inv')}@test.example.com`,
    role: 'MEMBER',
    firstName: 'Test',
    lastName: 'Invite',
    ...overrides,
  };
}

export function buildWebhookSubscription(overrides: Record<string, unknown> = {}) {
  return {
    url: `https://test.example.com/webhooks/${unique('wh')}`,
    events: ['user.created', 'user.updated'],
    ...overrides,
  };
}

// Phase 4 Group 4b — feedback factory rewritten to match the live `POST
// /feedback` DTO (`CreateFeedbackDto`). The prior Phase-0 version used a
// legacy `category: 'FEATURE_REQUEST'` shape that the current DTO no longer
// accepts (category is admin-set; submitters send sentiment + message + page).
// Keep the function name so callers don't break; the signature already takes
// overrides to layer on any admin-side transitions a caller needs.
export function buildFeedback(overrides: Record<string, unknown> = {}) {
  return {
    // Neutral sentiment — each test can override to exercise sentiment-range
    // filters on the admin list path.
    sentiment: 3,
    // Unique suffix guarantees the message is provably distinct even when
    // two specs run in parallel (cross-spec deduping + semantic assertion).
    message: `Phase-4-b feedback probe ${unique('fb')}`,
    page: '/phase-4-probe',
    ...overrides,
  };
}

// PATCH /admin/feedback/:id/resolve body. Per `ResolveFeedbackDto` the
// `note` is required, min 1 char, max 2000. Short but non-empty.
export function buildFeedbackResolve(overrides: Record<string, unknown> = {}) {
  return {
    note: `Resolved by Phase-4-b probe ${unique('res')}`,
    ...overrides,
  };
}

// PATCH /admin/feedback/:id/status — the DTO today only accepts 'reviewed'
// (see `UpdateStatusDto.@IsIn(['reviewed'])`). Keep the override hatch in
// case the enum widens later; today the factory is a single-value emitter.
export function buildFeedbackStatusUpdate(overrides: Record<string, unknown> = {}) {
  return {
    status: 'reviewed',
    ...overrides,
  };
}

// PATCH /admin/feedback/:id/category — DTO enum is ['bug', 'idea', 'general'].
export function buildFeedbackCategoryUpdate(overrides: Record<string, unknown> = {}) {
  return {
    category: 'bug',
    ...overrides,
  };
}

// POST /api-keys — `CreateApiKeyDto`. `name` + at least one scope required;
// factory defaults to two cheap read-only scopes and no IP allowlist (opt-in
// field). Tests that need specific scope surfaces override `scopes`.
export function buildApiKeyCreate(overrides: Record<string, unknown> = {}) {
  return {
    name: `Phase-4-b api-key ${unique('ak')}`,
    scopes: ['platform:read', 'knowledge:read'],
    ...overrides,
  };
}

// ── Settings factories ───────────────────────────────────────────────────────
//
// Minimal-but-valid payloads for the settings PUT endpoints. All mutation
// tests MUST use these — never build inline JSON.
//
// Shape guidance sources:
//   - user-preferences.dto.ts.
//   - super-admin-preferences.dto.ts.

export function buildUserPreferences(overrides: Record<string, unknown> = {}) {
  // `timezone` + `dateFormat` are plain strings that exist on every row and
  // round-trip cleanly. Using unusual-but-valid values surfaces accidental
  // no-op PUTs (the service mounts an `upsert`, so the response must echo
  // the change).
  return {
    timezone: 'America/Chicago',
    dateFormat: 'YYYY-MM-DD',
    ...overrides,
  };
}

export function buildSuperAdminPreferences(overrides: Record<string, unknown> = {}) {
  // Three-field payload — all `@IsOptional` on the DTO. Flip from the seeded
  // defaults (all-true / immediate) so the echo is provably distinct.
  return {
    notifyNewTenants: false,
    notifyStatusChanges: false,
    notificationFrequency: 'daily',
    ...overrides,
  };
}

// ── Phase 4 Group 4c — tenants factories ────────────────────────────────────
//
// Factory shapes MUST match `apps/backend/src/domains/platform/tenants/dto/`:
//   - `RegisterTenantDto` — public POST /tenants/register (Turnstile-gated).
//   - `UpdateTenantDto`   — SUPER_ADMIN PATCH /tenants/:tenantId.
//   - `SuspendTenantDto`  — SUPER_ADMIN POST /tenants/:tenantId/suspend.
//   - `/reject` takes a raw `{ reason: string }` body (no DTO class); factory
//     returns the same shape so the rubric's "no inline JSON" rule holds.
//
// The `register` factory emits clearly test-marked values (prefix
// `qa-test-`, timestamp-suffixed) so a real tenant isn't created by
// accident if Turnstile ever goes fail-open.

/**
 * POST /tenants/register body. Public endpoint, Turnstile-gated.
 *
 * The default payload omits `turnstileToken` — which means the request
 * WILL be rejected by the Turnstile middleware on any env with
 * `TURNSTILE_SECRET_KEY` set (dev + staging + prod). Callers who need the
 * happy-path test override `turnstileToken` with a valid Turnstile dev
 * token (`1x00000000000000000000AA` is Cloudflare's documented test
 * token that always passes verification) AND gate the test with
 * `@requires:data-tenant-register-bypass`.
 *
 * Safe-by-default: the subdomain / email / firebaseUid carry fresh unique
 * suffixes so even if Turnstile ever fails-open in dev, two simultaneous
 * test runs can't collide on the unique indexes.
 */
export function buildTenantRegistration(overrides: Record<string, unknown> = {}) {
  const nonce = unique('tn');
  return {
    companyName: `QA Test Company ${nonce}`,
    subdomain: `qa-test-${nonce}`.toLowerCase(),
    firstName: 'QA',
    lastName: 'Probe',
    email: `qa-test-${nonce}@test.example.com`,
    firebaseUid: `qa-test-fb-${nonce}`,
    phone: '5555550100',
    ...overrides,
  };
}

/**
 * PATCH /tenants/:tenantId body. Default mutates `ownerPhone` — it's the
 * lowest-blast-radius scalar on `UpdateTenantDto` (the Prisma side updates
 * `tenant.contactPhone` via the same field). Caller captures prior state,
 * PATCHes with overrides, then restores via a second PATCH.
 */
export function buildTenantUpdate(overrides: Record<string, unknown> = {}) {
  return {
    ownerPhone: '(555) 555-0199',
    ...overrides,
  };
}

/**
 * POST /tenants/:tenantId/suspend body. `SuspendTenantDto` requires
 * `reason` ≥ 10 chars. Used only when a suspendable tenant exists (never
 * the seeded demo tenant) — gated by `@requires:data-suspendable-tenant`
 * when the spec activates it.
 */
export function buildTenantSuspend(overrides: Record<string, unknown> = {}) {
  return {
    reason: `QA Phase-4c suspension probe ${unique('sus')}`,
    ...overrides,
  };
}

/**
 * POST /tenants/:tenantId/reject body. Controller reads `reason` via
 * `@Body('reason')` — it's a plain string field with no DTO class (no
 * length validation server-side). Factory emits a non-empty string so the
 * rejection reason is recorded meaningfully.
 */
export function buildTenantReject(overrides: Record<string, unknown> = {}) {
  return {
    reason: `QA Phase-4c rejection probe ${unique('rej')}`,
    ...overrides,
  };
}

// ── Phase 4 Group 4d — users + invitations factories ────────────────────────
//
// Factories mirror `CreateUserDto` / `UpdateUserDto` / `AcceptInvitationDto`
// 1:1. The invitation-side `buildUserInvitation` is declared above next to
// the legacy feedback/webhook factories — the shape already matches the
// live `InviteUserDto` so we leave it in place (verified against the DTO).
//
// Every factory uses the `unique()` helper to guarantee cross-spec /
// cross-worker isolation — unique email/firebaseUid suffixes are the only
// fence against `{tenantId, email}` collisions when two specs run
// concurrently.

/**
 * POST /users body — matches `CreateUserDto`.
 *
 * All four fields are `@IsNotEmpty()`; `role` is `@IsEnum(UserRole)`. Default
 * emits a MEMBER user with a fresh unique email suffix. OWNER-promotion
 * is blocked at the service layer (a tenant can only have one OWNER); the
 * SUPER_ADMIN role can only be created without a tenant, also blocked in
 * tenant-scoped paths. Tests that need a different role override `role`.
 */
export function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    email: `qa-user-${unique('usr')}@test.example.com`,
    firstName: 'QA',
    lastName: 'User',
    role: 'MEMBER',
    ...overrides,
  };
}

/**
 * PATCH /users/:userId body — matches `UpdateUserDto` (all fields
 * `@IsOptional()`). Default mutates `firstName` only — low blast radius,
 * no role-promotion side effect, easy to observe in the response echo.
 * Caller captures prior state and restores via a second PATCH with the
 * captured value (test-suite convention for non-destructive round-trips).
 */
export function buildUserUpdate(overrides: Record<string, unknown> = {}) {
  return {
    firstName: `QAPatched-${unique('usr')}`,
    ...overrides,
  };
}

/**
 * POST /invitations/accept body — matches `AcceptInvitationDto`.
 *
 * Both fields are `@IsNotEmpty()`. `token` is opaque (32-char nanoid);
 * `firebaseUid` is an opaque string the backend stores as-is (Firebase
 * Admin SDK is NOT invoked during the accept flow, verified on the dev
 * env 2026-04-20 — `acceptInvitation` in `user-invitations.service.ts`
 * writes the uid directly to the new User row without verification).
 * Caller MUST pass the token from the prior create response; factory
 * emits a fresh pseudo-firebaseUid so each accept lands a distinct row.
 */
export function buildInvitationAccept(overrides: Record<string, unknown> = {}) {
  return {
    // The caller always overrides `token` — declared here with a placeholder
    // so the shape is the same `{token, firebaseUid}` type every caller sees.
    token: overrides.token ?? 'OVERRIDE-ME',
    firebaseUid: `qa-fb-${unique('fb')}`,
    ...overrides,
  };
}

/**
 * DELETE /invitations/:invitationId body — controller reads `reason` via
 * `@Body('reason')`, optional on the service side (stored as
 * `cancellationReason` on the row). Factory emits a non-empty string so
 * the cancellation is recorded meaningfully on the row.
 */
export function buildInvitationCancel(overrides: Record<string, unknown> = {}) {
  return {
    reason: `QA Phase-4d cancellation probe ${unique('inv-cancel')}`,
    ...overrides,
  };
}

// ── Phase 4 Group 4e — plans + announcements factories ──────────────────────
//
// Plans-side factories MUST only emit fields that can be restored losslessly
// in afterEach — every PATCH targets `STARTER` (the lowest-blast-radius
// plan). The caller captures original state before mutating, writes via the
// factory payload, then restores via a second PATCH using the captured
// original.
//
// Announcement factories default to TENANT-targeted broadcasts with a
// bogus tenantId (`__qa_no_match_tenant__`) so PUBLISHED rows can never
// surface in `GET /broadcasts/active` for real tenants. Tests that
// deliberately want the row to appear on /broadcasts/active override
// `targetIds` to the current tenant.

/**
 * PATCH /plans/:plan body — `UpdatePlanConfigDto`. The DTO accepts seven
 * `@IsOptional` fields; the factory defaults to mutating ONLY `displayName`
 * (the lowest-risk scalar — cosmetic, no entitlement/billing side effects).
 * Callers override for targeted field coverage and MUST capture the
 * original value + restore it in afterEach.
 */
export function buildPlanUpdate(overrides: Record<string, unknown> = {}) {
  return {
    displayName: `[QA-TEST] Phase-4e ${unique('plan-update')}`.slice(0, 100),
    ...overrides,
  };
}

/**
 * PATCH /plans/:plan/provider-price body. `providerPriceId` is a nullable
 * string — factory emits a clearly test-marked value. Restored in afterEach
 * via a second PATCH with the captured original.
 */
export function buildPlanProviderPriceUpdate(overrides: Record<string, unknown> = {}) {
  return {
    providerPriceId: `[QA-TEST] price_${unique('price')}`,
    ...overrides,
  };
}

/**
 * PATCH /plans/tenant/:tenantId body. Assigns a `TenantPlan` to a tenant;
 * the controller also threads an optional `reason` string into the
 * `tenant_plan_events` audit row. Callers capture the tenant's original
 * plan via GET /plans/tenant/:tenantId and restore in afterEach.
 *
 * Default `plan` is `STARTER` — the lowest-entitlement tier, safe to assign
 * and restore on a non-demo target tenant.
 */
export function buildPlanAssignment(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'STARTER',
    reason: `[QA-TEST] Phase-4e plan-assignment probe ${unique('assign')}`,
    ...overrides,
  };
}

/**
 * PATCH /plans/:plan/entitlements/:feature body — `ToggleEntitlementDto`.
 * Flips the `enabled` bit on one entitlement row. Caller captures the
 * original enabled value and restores in afterEach via a second PATCH.
 */
export function buildPlanEntitlementToggle(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    ...overrides,
  };
}

/**
 * POST /admin/broadcasts body — `CreateAnnouncementDto`. Default emits a
 * TENANT-targeted broadcast with a bogus tenantId so that even if the
 * test publishes the row, it never appears in any real tenant's
 * `/broadcasts/active` feed (the service filters by targetType + membership
 * in targetIds). Tests that want the row to surface on /broadcasts/active
 * override `targetIds` to include the calling tenant.
 *
 * `title` is prefixed with `[QA-TEST]` so accidentally-leaked rows are
 * obvious in the admin UI. The `unique()` suffix guarantees parallel-run
 * distinctness for semantic assertions.
 */
export function buildAnnouncement(overrides: Record<string, unknown> = {}) {
  return {
    title: `[QA-TEST] Phase-4e ${unique('bcast')}`,
    body: 'QA Phase-4e broadcast probe body.',
    targetType: 'TENANT',
    targetIds: ['__qa_no_match_tenant__'],
    priority: 'INFO',
    ...overrides,
  };
}

/**
 * PATCH /admin/broadcasts/:id body — `UpdateAnnouncementDto` (extends
 * PartialType(Create)). Default mutates ONLY `title` because PartialType
 * applies DTO defaults for undefined fields, which silently resets
 * `targetType` / `targetIds` / `priority` if not provided. Callers that
 * need targeted multi-field updates MUST provide every field they care
 * about in overrides — see `_helpers.ts::createDraftBroadcast` for the
 * echo-safe full-payload pattern.
 */
export function buildAnnouncementUpdate(overrides: Record<string, unknown> = {}) {
  return {
    title: `[QA-TEST] Phase-4e updated ${unique('bcast-upd')}`,
    ...overrides,
  };
}

// ── Phase 4 Group 4g — OAuth factories ─────────────────────────────────────
//
// Two controllers, two wire idioms:
//   - `oauth-clients.controller.ts` — authenticated CRUD. camelCase DTOs
//     (`CreateOAuthClientSchema` / `UpdateOAuthClientSchema` in shared-types).
//   - `oauth-provider.controller.ts` — RFC 6749 / 7009 / 7591 public. The
//     RFC shapes are snake_case on the wire (`client_name`, `redirect_uris`,
//     `grant_type`, `code_verifier`, `token_type_hint`, etc.). Factories
//     emit the RFC snake_case fields directly so no mapping layer is needed
//     in the spec body.
//
// The `redirect_uris` validator on the register endpoint REJECTS non-HTTPS
// redirects that aren't localhost / 127.0.0.1, so the factory's default
// uses `http://localhost:3000/oauth/callback` (the MCP-style loopback URI
// the DCR spec §8 recommends). Tests that want the rejection path override
// with `https://example.com` or `http://bad-host.test`.
//
// PKCE code challenge: the authorize endpoint requires `code_challenge`
// 43..128 chars + `code_challenge_method=S256`. The factory emits a fixed
// 43-char challenge derived from a known verifier so the verifier-challenge
// pair round-trips in PKCE-aware tests. Computed once at module load:
//   verifier  = "test-verifier-phase-4g-0123456789ABCDEFGHIJK" (43 chars)
//   challenge = base64url(sha256(verifier))   — 43 chars after stripping '='
import { createHash as _createHash } from 'node:crypto';

/** Known-good PKCE verifier / challenge pair for Phase 4g. 43 chars each. */
const PKCE_CODE_VERIFIER = 'test-verifier-phase-4g-0123456789ABCDEFGHIJK';
const PKCE_CODE_CHALLENGE = _createHash('sha256')
  .update(PKCE_CODE_VERIFIER)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

export const OAUTH_PKCE_VERIFIER = PKCE_CODE_VERIFIER;
export const OAUTH_PKCE_CHALLENGE = PKCE_CODE_CHALLENGE;

/**
 * POST /oauth/clients body — matches `CreateOAuthClientSchema` in
 * `@app/shared-types/platform/oauth.schema.ts`. camelCase.
 *
 * Default emits a confidential client (the common case — the service also
 * accepts `public` which omits the client_secret on RFC 7591 but on the
 * admin-side CRUD path the secret is always emitted). Redirect is a
 * localhost callback so the same factory works for both admin CRUD and
 * the RFC register factory below.
 */
export function buildOAuthClient(overrides: Record<string, unknown> = {}) {
  return {
    name: `[QA-TEST] Phase-4g client ${unique('oauth-cl')}`,
    redirectUris: ['http://localhost:3000/oauth/callback'],
    scopes: ['platform:read'],
    clientType: 'confidential',
    ...overrides,
  };
}

/**
 * PUT /oauth/clients/:clientId body — matches `UpdateOAuthClientSchema`.
 * All four fields are optional; default mutates `name` ONLY (lowest blast
 * radius — no scope / URI change so downstream authorize paths are still
 * valid). Callers that want to exercise the redirectUris / scopes / name
 * combinations override as needed.
 */
export function buildOAuthClientUpdate(overrides: Record<string, unknown> = {}) {
  return {
    name: `[QA-TEST] Phase-4g updated ${unique('oauth-upd')}`,
    ...overrides,
  };
}

/**
 * POST /oauth/register body — RFC 7591 Dynamic Client Registration.
 * Public endpoint (no auth); rate-limited at 5/min.
 *
 * RFC 7591 fields are snake_case on the wire; factory emits them exactly
 * as the spec requires. `token_endpoint_auth_method: 'none'` marks the
 * client `public` (no client_secret issued); override to
 * `'client_secret_post'` / `'client_secret_basic'` to mark it confidential
 * (client_secret IS issued). Default is `none` — MCP clients (Claude
 * Desktop / ChatGPT Connectors) register as public.
 */
export function buildOAuthRegister(overrides: Record<string, unknown> = {}) {
  return {
    client_name: `[QA-TEST] Phase-4g DCR ${unique('oauth-reg')}`,
    redirect_uris: ['http://localhost:3000/oauth/callback'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    ...overrides,
  };
}

/**
 * GET /oauth/authorize query params — RFC 6749 §4.1.1 authorization
 * request. Factory emits the full PKCE-aware set (response_type=code +
 * S256 PKCE challenge). Callers override `client_id` with a freshly-
 * registered test client id so the authorize call passes the
 * redirectUris / scopes check.
 *
 * Returns a plain object; callers use `new URLSearchParams(params).toString()`
 * to build the query string. `state` is a fresh unique nonce every call so
 * consent-challenge JWTs don't collide across parallel workers.
 */
export function buildOAuthAuthorizeParams(overrides: Record<string, unknown> = {}) {
  return {
    response_type: 'code',
    client_id: 'OVERRIDE-ME',
    redirect_uri: 'http://localhost:3000/oauth/callback',
    scope: 'platform:read',
    state: unique('oauth-state'),
    code_challenge: PKCE_CODE_CHALLENGE,
    code_challenge_method: 'S256',
    ...overrides,
  };
}

/**
 * POST /oauth/token body — RFC 6749 §4.1.3 / §6. Default emits an
 * authorization_code grant skeleton with the known PKCE verifier; callers
 * typically override to exercise the error paths (missing code / bogus
 * grant_type) since the happy path requires a real authorization_code
 * issued via the consent flow (out of scope per Phase 4g Q3).
 */
export function buildOAuthTokenBody(overrides: Record<string, unknown> = {}) {
  return {
    grant_type: 'authorization_code',
    code: 'bogus-code-qa-phase-4g',
    redirect_uri: 'http://localhost:3000/oauth/callback',
    client_id: 'OVERRIDE-ME',
    code_verifier: PKCE_CODE_VERIFIER,
    ...overrides,
  };
}

/**
 * POST /oauth/revoke body — RFC 7009. Default emits a bogus token so the
 * revoke test exercises the always-200 contract (RFC 7009 §2.2 —
 * the server MUST return 200 regardless of whether the token existed, to
 * prevent token enumeration). `token_type_hint` is optional; factory
 * omits it by default.
 */
export function buildOAuthRevokeBody(overrides: Record<string, unknown> = {}) {
  return {
    token: `qa-bogus-token-${unique('oauth-rev')}`,
    ...overrides,
  };
}

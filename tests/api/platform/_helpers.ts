/**
 * Shared setup helpers for the Phase 4 platform spec suite — specifically
 * Group 4c (`tenants.spec.ts`). Underscore-prefixed so Playwright's default
 * collector ignores it.
 *
 * Every helper follows the `tests/api/operations/_helpers.ts` and
 * `tests/api/financials/_helpers.ts` conventions:
 *
 *   - Typed return shape (never `any`).
 *   - When a precondition can't be bootstrapped from scratch, throw a
 *     clear error that names the `@requires:data-<kind>` tag the caller
 *     SHOULD apply. Never return a sentinel like `null` that forces the
 *     caller to branch — the helper is the precondition gate.
 *   - Never mutate state in a helper — the caller owns before/after
 *     restore semantics. Helpers are read-only discovery only.
 *
 * Tenants-specific notes:
 *   - Approve / reject / suspend / reactivate are TERMINAL state
 *     transitions. There is no public DELETE and no rollback endpoint.
 *     Tests that use `firstPendingTenantId` MUST tag
 *     `@requires:data-pending-tenant` — the helper picks the first row
 *     and mutates it in the test body; once consumed it's gone for the
 *     rest of that test run.
 *   - `demo-northstar-2026` (the QA tenant) is ACTIVE and MUST NOT be
 *     touched by destructive transitions. The helpers below pick non-demo
 *     rows by filtering on `status` — they never surface an ACTIVE
 *     tenant as "suspendable" or "rejectable".
 */
import { expect } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { buildAnnouncement } from '@sally/test-utils/factories';

// ── firstPendingTenantId ──────────────────────────────────────────────

export interface PendingTenant {
  tenantId: string;
  subdomain: string;
  companyName: string;
}

/**
 * Find the first Tenant with status=PENDING_APPROVAL.
 *
 * Pending tenants originate from `POST /tenants/register` (public,
 * Turnstile-gated — see finding #37). The helper does NOT bootstrap one;
 * it returns an existing row, or throws so the caller can tag
 * `@requires:data-pending-tenant` and have the test excluded from
 * collection when none exist.
 *
 * Consumer MUST target `asSuperAdmin` — the endpoint is
 * `@Roles(SUPER_ADMIN)`-gated.
 */
export async function firstPendingTenantId(asSuperAdmin: RoleApiClient): Promise<PendingTenant> {
  const res = await asSuperAdmin.get('/tenants?status=PENDING_APPROVAL');
  expect(res.status(), 'GET /tenants?status=PENDING_APPROVAL bootstrap precondition should not fail').toBe(200);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{
        tenantId?: string;
        subdomain?: string;
        companyName?: string;
      }>)
    : [];
  const picked = list[0];
  if (!picked?.tenantId || !picked.subdomain || !picked.companyName) {
    throw new Error(
      'firstPendingTenantId: no PENDING_APPROVAL tenants on this env — ' +
        'tag test @requires:data-pending-tenant. Seed via POST /tenants/register ' +
        '(Turnstile disabled) or flip TESTS_DATA_CAPABILITIES=pending-tenant ' +
        'after manually verifying GET /tenants?status=PENDING_APPROVAL is non-empty.',
    );
  }
  return {
    tenantId: picked.tenantId,
    subdomain: picked.subdomain,
    companyName: picked.companyName,
  };
}

// ── firstSuspendedTenantId ────────────────────────────────────────────

export interface SuspendedTenant {
  tenantId: string;
  subdomain: string;
  companyName: string;
}

/**
 * Find the first Tenant with status=SUSPENDED — precondition for the
 * `POST /tenants/:tenantId/reactivate` test. Same self-provisioning
 * caveat as `firstPendingTenantId`: no bootstrap, throws if absent so
 * the caller tags `@requires:data-suspended-tenant`.
 */
export async function firstSuspendedTenantId(asSuperAdmin: RoleApiClient): Promise<SuspendedTenant> {
  const res = await asSuperAdmin.get('/tenants?status=SUSPENDED');
  expect(res.status(), 'GET /tenants?status=SUSPENDED bootstrap precondition should not fail').toBe(200);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{
        tenantId?: string;
        subdomain?: string;
        companyName?: string;
      }>)
    : [];
  const picked = list[0];
  if (!picked?.tenantId || !picked.subdomain || !picked.companyName) {
    throw new Error(
      'firstSuspendedTenantId: no SUSPENDED tenants on this env — ' +
        'tag test @requires:data-suspended-tenant. Suspend a non-critical ' +
        'ACTIVE tenant manually (POST /tenants/:id/suspend) or flip ' +
        'TESTS_DATA_CAPABILITIES=suspended-tenant after verifying ' +
        'GET /tenants?status=SUSPENDED is non-empty.',
    );
  }
  return {
    tenantId: picked.tenantId,
    subdomain: picked.subdomain,
    companyName: picked.companyName,
  };
}

// ── demoTenantId ──────────────────────────────────────────────────────

/**
 * The QA tenant id. Every Group 4c test that operates on a KNOWN tenant
 * (branding lookup, details read, safe non-destructive sanity checks)
 * uses the env `TENANT_ID` rather than hardcoding — lets the spec run
 * against any dev tenant that has a valid public subdomain.
 *
 * NOTE: the `GET /tenants/branding/:subdomain` endpoint takes the
 * SUBDOMAIN, not the tenantId. Group 4c resolves the subdomain via the
 * list endpoint (one call per test body), so there's no helper for it
 * here — the resolve-subdomain step lives inline in the spec.
 */
export function demoTenantId(): string {
  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    throw new Error(
      'demoTenantId: TENANT_ID env var is not set. ' + 'Set TENANT_ID=<tenant-id> or run via pnpm test:api:local.',
    );
  }
  return tenantId;
}

// ── firstAssignableTenantId ──────────────────────────────────────────
//
// Plan-assignment precondition for Group 4e. `PATCH /plans/tenant/:id`
// mutates a tenant's `plan` column; to stay safe we:
//   - NEVER touch `demo-northstar-2026` (the QA tenant every other spec
//     runs against — mutating its plan would cascade across the suite).
//   - NEVER touch SUSPENDED tenants (already terminal; the plan is
//     effectively frozen and reactivation is out-of-scope for 4e).
//   - Prefer PENDING_APPROVAL tenants when available (spec §8 notes
//     they're the safest targets since they're not yet serving users).
//   - Fall back to any non-demo, non-SUSPENDED tenant and restore the
//     original plan in afterEach.
//
// The caller captures the original `plan` before the write and passes it
// back to the restore PATCH; the helper returns only the tenantId +
// starting plan + subdomain/companyName for semantic assertions.

export interface AssignableTenant {
  tenantId: string;
  subdomain: string;
  companyName: string;
  /** The tenant's plan at the time of discovery — used for afterEach restore. */
  originalPlan: string;
  /** Status bucket — prefer PENDING_APPROVAL, fall back to ACTIVE/TRIAL_EXPIRED. */
  status: string;
}

/**
 * Find a tenant that is safe to re-plan + restore. Preference order:
 *   1. PENDING_APPROVAL (if any)
 *   2. ACTIVE non-demo (any plan; the test flips + restores)
 *
 * Throws if no candidate is found so the caller tags
 * `@requires:data-assignable-tenant` and the test is excluded from
 * collection rather than failing opaquely at runtime.
 *
 * Consumer MUST target `asSuperAdmin` — `GET /tenants` is
 * `@Roles(SUPER_ADMIN)`-gated.
 */
export async function firstAssignableTenantId(asSuperAdmin: RoleApiClient): Promise<AssignableTenant> {
  const demo = process.env.TENANT_ID;
  if (!demo) {
    throw new Error(
      'firstAssignableTenantId: TENANT_ID env var is not set — the helper ' +
        'must know which tenant to EXCLUDE from candidates.',
    );
  }

  const res = await asSuperAdmin.get('/tenants');
  expect(res.status(), 'GET /tenants bootstrap precondition should not fail').toBe(200);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{
        tenantId?: string;
        subdomain?: string;
        companyName?: string;
        status?: string;
        plan?: string;
      }>)
    : [];

  // Filter out the demo tenant + any SUSPENDED tenant.
  const candidates = list.filter(
    (t) =>
      t.tenantId !== demo &&
      t.status !== 'SUSPENDED' &&
      t.status !== 'REJECTED' &&
      typeof t.tenantId === 'string' &&
      typeof t.subdomain === 'string' &&
      typeof t.companyName === 'string' &&
      typeof t.plan === 'string' &&
      typeof t.status === 'string',
  );
  // Prefer PENDING_APPROVAL rows (safest — tenant not yet active).
  const pending = candidates.find((t) => t.status === 'PENDING_APPROVAL');
  const picked = pending ?? candidates[0];

  if (!picked) {
    throw new Error(
      'firstAssignableTenantId: no non-demo, non-SUSPENDED tenant on this ' +
        'env — tag test @requires:data-assignable-tenant. Seed a secondary ' +
        'tenant (or flip TESTS_DATA_CAPABILITIES=assignable-tenant after ' +
        'manually verifying GET /tenants returns a second non-SUSPENDED row).',
    );
  }
  return {
    tenantId: picked.tenantId!,
    subdomain: picked.subdomain!,
    companyName: picked.companyName!,
    originalPlan: picked.plan!,
    status: picked.status!,
  };
}

// ── createDraftBroadcast ─────────────────────────────────────────────
//
// Shared bootstrap for the announcement state-transition tests. Every
// publish/archive/update test creates a fresh DRAFT broadcast via
// POST /admin/broadcasts. This helper factors out the creation + the
// id extraction so the spec body stays small.
//
// The default body mirrors `buildAnnouncement()` — TENANT-targeted with a
// bogus tenantId so PUBLISHED rows CANNOT surface on any real tenant's
// /broadcasts/active feed. Tests that want visibility override
// `overrides.targetIds`.
//
// Returns the full draft row + the numeric id so the caller can both
// semantically assert on the fresh state AND wire up mutation paths.

export interface DraftBroadcast {
  id: number;
  title: string;
  body: string;
  status: 'DRAFT';
  targetType: 'ALL' | 'PLAN' | 'TENANT';
  targetIds: string[];
  priority: 'INFO' | 'WARNING' | 'CRITICAL';
}

export async function createDraftBroadcast(
  asSuperAdmin: RoleApiClient,
  overrides: Record<string, unknown> = {},
): Promise<DraftBroadcast> {
  const payload = buildAnnouncement(overrides);
  const res = await asSuperAdmin.post('/admin/broadcasts', payload);
  expect(res.status(), 'createDraftBroadcast bootstrap POST /admin/broadcasts should not fail').toBe(201);
  const row = (await res.json()) as {
    id?: number;
    title?: string;
    body?: string;
    status?: string;
    targetType?: 'ALL' | 'PLAN' | 'TENANT';
    targetIds?: string[];
    priority?: 'INFO' | 'WARNING' | 'CRITICAL';
  };
  if (
    typeof row.id !== 'number' ||
    typeof row.title !== 'string' ||
    typeof row.body !== 'string' ||
    row.status !== 'DRAFT' ||
    !row.targetType ||
    !Array.isArray(row.targetIds) ||
    !row.priority
  ) {
    throw new Error(`createDraftBroadcast: unexpected POST /admin/broadcasts response shape — ${JSON.stringify(row)}`);
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: 'DRAFT',
    targetType: row.targetType,
    targetIds: row.targetIds,
    priority: row.priority,
  };
}

// ── archiveBroadcastSafe ─────────────────────────────────────────────
//
// Best-effort afterEach cleanup. Tests that create broadcasts MUST call
// this in afterEach to avoid polluting the admin list + the public
// /broadcasts/active feed on subsequent runs.
//
// Archive is idempotent on an already-ARCHIVED row (the service calls
// update() which no-ops when status is unchanged). If the id was never
// created (early test failure), the caller passes null/undefined and
// this helper is a no-op.

export async function archiveBroadcastSafe(asSuperAdmin: RoleApiClient, id: number | null | undefined): Promise<void> {
  if (id == null) return;
  const res = await asSuperAdmin.post(`/admin/broadcasts/${id}/archive`, {});
  // Nest's default POST status is 201; archive returns 201 on happy path.
  // 404 means the row was deleted out-of-band (or never existed). Either
  // way, don't fail the suite for a cleanup hiccup — log noisily only on
  // unexpected statuses.
  if (res.status() !== 201 && res.status() !== 200 && res.status() !== 404) {
    // eslint-disable-next-line no-console
    console.error(`archiveBroadcastSafe: failed to archive broadcast ${id} (HTTP ${res.status()})`);
  }
}

// ── Add-ons helpers (Phase 4 Group 4f) ──────────────────────────────────
//
// Three coordinated helpers for the add-on surface:
//
//   1. `setPaymentSystemFlag` — toggle the global `payment_system` feature
//      flag. Required for activate / request / approve tests because the
//      default (payment_system=true) routes activations through Stripe,
//      where the demo tenant's existing subscription items collide with
//      any re-activation. Tests flip the flag OFF in beforeAll and
//      restore in afterAll. The helper is a thin PUT wrapper — callers
//      capture the current value via GET before the flip.
//
//   2. `ensureInactiveAddOn` — precondition for request / activate tests.
//      Cancels the specified slug on the caller's tenant so the request
//      / activation can proceed (the service blocks those paths when a
//      TenantAddOn row is already `status='active'`). Idempotent — no-op
//      if already cancelled; throws only on unexpected HTTP statuses.
//
//   3. `reactivateAddOnSafe` — best-effort afterEach / afterAll cleanup
//      to restore an add-on to active state. Requires the payment_system
//      flag to be OFF (or the add-on to be trial-gifted) — callers must
//      order it before the flag restore. On failure it logs rather than
//      throwing so one cleanup hiccup doesn't cascade into multiple test
//      failures.
//
// The **target slug** for self-service tests is `nerve_center` because:
//   - It has `providerPriceId: null`, so the Stripe check rejects any
//     activate / approve flow with payment_system=true — that identifies
//     it as the "not-wired-to-Stripe" add-on in the seed.
//   - It's gifted (not purchased), so cancel + re-activate doesn't
//     interact with any real Stripe subscription.
//   - It's active on `demo-northstar-2026` at seed, so the
//     `ensureInactiveAddOn` round-trip always starts from `active`.
// If the seed ever removes nerve_center, tests will fail loudly on the
// ensureInactiveAddOn precondition (expecting `active` before cancel).

export const ADDON_TEST_SLUG = 'nerve_center';

/** Toggle the global `payment_system` feature flag. Returns the new value. */
export async function setPaymentSystemFlag(asSuperAdmin: RoleApiClient, enabled: boolean): Promise<boolean> {
  const res = await asSuperAdmin.put('/feature-flags/payment_system', {
    enabled,
  });
  expect(res.status(), `setPaymentSystemFlag(${enabled}) should return 200`).toBe(200);
  const body = (await res.json()) as { enabled?: boolean };
  if (typeof body.enabled !== 'boolean') {
    throw new Error(`setPaymentSystemFlag: unexpected response shape — ${JSON.stringify(body)}`);
  }
  return body.enabled;
}

/**
 * Read the current `payment_system` flag value — used in beforeAll to
 * capture the original state for later restoration.
 */
export async function readPaymentSystemFlag(asAnonymous: RoleApiClient): Promise<boolean> {
  const res = await asAnonymous.get('/feature-flags/payment_system');
  expect(res.status(), 'readPaymentSystemFlag GET /feature-flags/payment_system should return 200').toBe(200);
  const body = (await res.json()) as { enabled?: boolean };
  if (typeof body.enabled !== 'boolean') {
    throw new Error(`readPaymentSystemFlag: unexpected response shape — ${JSON.stringify(body)}`);
  }
  return body.enabled;
}

/**
 * Ensure the given add-on slug is in the `cancelled` state for the
 * caller's tenant. Idempotent — no-op if already cancelled. Used as a
 * precondition for request / activate tests.
 *
 * The self-service cancel endpoint accepts OWNER/ADMIN callers. The
 * helper accepts any `RoleApiClient` so the test body controls the role.
 */
export async function ensureInactiveAddOn(asOwner: RoleApiClient, slug: string = ADDON_TEST_SLUG): Promise<void> {
  // Read current status first — the cancel endpoint throws 400 on an
  // already-cancelled row, so we branch on the observed state.
  const statusRes = await asOwner.get(`/add-ons/${slug}/status`);
  expect(statusRes.status(), `ensureInactiveAddOn: status precondition for '${slug}' should succeed`).toBe(200);
  const statusBody = (await statusRes.json()) as {
    tenantAddOn?: { status?: string } | null;
  };
  const currentStatus = statusBody?.tenantAddOn?.status ?? null;
  if (currentStatus === 'cancelled') return;
  if (currentStatus !== 'active') {
    // The tenant has never subscribed — nothing to cancel.
    return;
  }

  const cancelRes = await asOwner.post(`/add-ons/${slug}/cancel`, {});
  if (cancelRes.status() !== 200 && cancelRes.status() !== 201) {
    const text = await cancelRes.text();
    throw new Error(`ensureInactiveAddOn: cancel of '${slug}' failed — HTTP ${cancelRes.status()}: ${text}`);
  }
}

/**
 * Best-effort afterEach restore. Tries to activate the add-on so the
 * tenant lands back in the seeded `active` state. Callers MUST ensure
 * `payment_system=false` BEFORE invoking this helper (or the add-on is
 * trial-gifted); otherwise the Stripe sync will reject and the restore
 * will fail.
 *
 * On failure the helper logs and returns — one cleanup miss does not
 * cascade.
 */
export async function reactivateAddOnSafe(asOwner: RoleApiClient, slug: string = ADDON_TEST_SLUG): Promise<void> {
  const res = await asOwner.post(`/add-ons/${slug}/activate`, {});
  if (res.status() !== 200 && res.status() !== 201) {
    // eslint-disable-next-line no-console
    console.error(`reactivateAddOnSafe: failed to reactivate '${slug}' — HTTP ${res.status()}`);
  }
}

// ── Add-on request helpers (Phase 4 Group 4f, admin side) ───────────────

/**
 * Create a fresh pending AddOnRequest on the caller's tenant for the
 * admin-side approve / decline tests. Preconditions (asserted):
 *   - The target add-on is NOT currently active on the tenant (the
 *     service throws 400 otherwise).
 *   - There is NO existing pending request for the same (tenant, addOn)
 *     pair (the service throws 400 otherwise).
 * The caller is responsible for invoking `ensureInactiveAddOn` first
 * AND for handling the restore side (request → decline/approve →
 * reactivate) in afterEach.
 *
 * Returns the created request id + the slug for the caller's assertions.
 */
export interface PendingAddOnRequest {
  id: string;
  slug: string;
  tenantDbId: number;
  addOnId: string;
}

export async function createPendingAddOnRequest(
  asOwner: RoleApiClient,
  slug: string = ADDON_TEST_SLUG,
  note: string = '[QA-TEST] Phase-4f admin-side request bootstrap',
): Promise<PendingAddOnRequest> {
  const res = await asOwner.post(`/add-ons/${slug}/request`, { note });
  if (res.status() !== 201) {
    const text = await res.text();
    throw new Error(`createPendingAddOnRequest: POST /add-ons/${slug}/request failed — HTTP ${res.status()}: ${text}`);
  }
  const body = (await res.json()) as {
    id?: string;
    tenantId?: number;
    addOnId?: string;
  };
  if (typeof body.id !== 'string' || typeof body.tenantId !== 'number' || typeof body.addOnId !== 'string') {
    throw new Error(`createPendingAddOnRequest: unexpected response shape — ${JSON.stringify(body)}`);
  }
  return {
    id: body.id,
    slug,
    tenantDbId: body.tenantId,
    addOnId: body.addOnId,
  };
}

// ── OAuth helpers (Phase 4 Group 4g) ────────────────────────────────────────
//
// Two coordinated helpers for the OAuth surface:
//
//   1. `createTestOAuthClient` — POSTs a fresh client via the admin CRUD
//      endpoint and returns the id + secret for the caller's cleanup. The
//      payload uses `buildOAuthClient` from `@sally/test-utils/factories`,
//      so the name is `[QA-TEST]`-prefixed and the redirect URI is the
//      localhost callback both the admin CRUD and the RFC /authorize
//      endpoint accept without TLS.
//
//   2. `deleteOAuthClientSafe` — idempotent afterEach cleanup. DELETE
//      returns 204 on success, 404 if the client was already revoked
//      (defensive — tests that fail mid-flight may leave the caller
//      unsure whether the revoke ran). Logs rather than throws on
//      unexpected non-204/404 statuses so a cleanup hiccup doesn't
//      cascade into multiple test failures.
//
// Scope: the OAuth client CRUD surface creates ROWS (not state transitions
// with tenant-wide side effects), so the helpers below don't need to thread
// through `originalPaymentSystemEnabled` or any capture-and-restore pattern.
// Every test creates its own fresh client; every afterEach revokes it.

import { buildOAuthClient as _buildOAuthClient } from '@sally/test-utils/factories';

export interface TestOAuthClient {
  clientId: string;
  clientSecret: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  clientType: 'confidential' | 'public';
}

/**
 * Create a fresh OAuth client via `POST /oauth/clients` and return the
 * client id + secret. Caller MUST wire up the afterEach cleanup path via
 * `deleteOAuthClientSafe`. Throws on unexpected HTTP status so the spec
 * fails loudly rather than proceeding with an undefined client id.
 *
 * The `asCreator` role should be OWNER/ADMIN/SUPER_ADMIN — the
 * `OAuthClientsController` is gated `@Roles(ADMIN, OWNER, SUPER_ADMIN)`.
 */
export async function createTestOAuthClient(
  asCreator: RoleApiClient,
  overrides: Record<string, unknown> = {},
): Promise<TestOAuthClient> {
  const payload = _buildOAuthClient(overrides);
  const res = await asCreator.post('/oauth/clients', payload);
  expect(res.status(), 'createTestOAuthClient bootstrap POST /oauth/clients should return 201').toBe(201);
  const body = (await res.json()) as {
    clientId?: string;
    clientSecret?: string;
    name?: string;
    redirectUris?: string[];
    scopes?: string[];
    clientType?: 'confidential' | 'public';
  };
  if (
    typeof body.clientId !== 'string' ||
    typeof body.clientSecret !== 'string' ||
    typeof body.name !== 'string' ||
    !Array.isArray(body.redirectUris) ||
    !Array.isArray(body.scopes) ||
    (body.clientType !== 'confidential' && body.clientType !== 'public')
  ) {
    throw new Error(`createTestOAuthClient: unexpected POST /oauth/clients shape — ${JSON.stringify(body)}`);
  }
  return {
    clientId: body.clientId,
    clientSecret: body.clientSecret,
    name: body.name,
    redirectUris: body.redirectUris,
    scopes: body.scopes,
    clientType: body.clientType,
  };
}

/**
 * Best-effort afterEach cleanup. Revoke (soft-delete) the client by
 * `clientId`. DELETE returns 204 on success, 404 if the row was already
 * revoked / deleted (no-op). Other statuses log but do not throw, so a
 * cleanup hiccup does not mask the real test failure.
 *
 * Pass null/undefined when the test failed before minting a client — the
 * helper is a no-op in that case.
 */
export async function deleteOAuthClientSafe(
  asAdmin: RoleApiClient,
  clientId: string | null | undefined,
): Promise<void> {
  if (!clientId) return;
  const res = await asAdmin.delete(`/oauth/clients/${clientId}`);
  if (res.status() !== 204 && res.status() !== 404) {
    // eslint-disable-next-line no-console
    console.error(
      `deleteOAuthClientSafe: DELETE /oauth/clients/${clientId} returned HTTP ${res.status()} — ` +
        'client may be left in an active state.',
    );
  }
}

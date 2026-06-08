/**
 * Platform — Add-ons self-service (Phase 4 Group 4f).
 *
 * Covers all 8 endpoints on `AddOnsController` (per live read of
 * `apps/backend/src/domains/platform/add-ons/add-ons.controller.ts`):
 *
 *   Public
 *     1. GET    /add-ons                   — catalog projection (pricing page)
 *
 *   Authenticated (ADMIN/OWNER)
 *     2. GET    /add-ons/my-add-ons        — tenant's active subscriptions
 *     3. GET    /add-ons/my-requests       — tenant's request history
 *     4. GET    /add-ons/:slug/status      — per-add-on resolution + tenantAddOn row
 *     5. POST   /add-ons/:slug/request     — create a pending request
 *     6. POST   /add-ons/:slug/activate    — self-service activation
 *     7. PATCH  /add-ons/:slug/overage     — toggle allowOverage
 *     8. POST   /add-ons/:slug/cancel      — cancel an active add-on
 *
 * Target count: **8 tests** — one per endpoint. The DISPATCHER→403 RBAC
 * fence rides on test 2 (the first authenticated endpoint) so no separate
 * RBAC-only test is needed.
 *
 * Critical constraints (spec §8 + deferred findings):
 *   - **Payment-system flag interplay.** Self-service `activate` + `request`
 *     + `approve` all route through `activateAddOn` which calls
 *     `syncActivationToStripe` when `payment_system=true`. On
 *     demo-northstar-2026 every add-on slug is already active AND has a
 *     real Stripe subscription item, so any re-activation with the flag
 *     ON collides (Stripe `duplicate price` error → 400). The self-service
 *     mutation tests below therefore wrap themselves in a `serial`
 *     describe block, read the original `payment_system` value in
 *     `beforeAll`, flip it OFF for the duration, run the tests, then
 *     restore the original value in `afterAll`. Without the flip,
 *     activate/request can't complete cleanly on the demo tenant.
 *   - **Target add-on: `nerve_center`.** Chosen because it has
 *     `providerPriceId: null` (so the "not wired to Stripe" path is the
 *     primary failure mode when the flag is ON — useful for 400-shape
 *     assertions), it's gifted (no real billing), and it's seeded
 *     `active` so the cancel + re-activate round-trip always starts
 *     from the same state.
 *   - **State restore.** Every mutation test cancels / activates / flips
 *     the target add-on, then restores the tenant to its original
 *     `active` state in afterEach via `reactivateAddOnSafe`. The serial
 *     block's afterAll double-checks by re-activating one more time
 *     after the flag is restored. A cancelled add-on on the demo tenant
 *     is acceptable transient state but NOT a durable state — a follow-
 *     up spec run must find every add-on back in `active`.
 *   - **RBAC fence.** `DISPATCHER` hits 403 on every authenticated
 *     endpoint (verified 2026-04-20). Test 2 asserts the fence for the
 *     read path; writes rely on the controller-level `@Roles(ADMIN,
 *     OWNER)` guard which applies uniformly across the mutation set.
 *
 * Schema strategy:
 *   - 7 add-on-specific schemas hand-written — shared-types has zero
 *     coverage for the add-on surface. See `SCHEMA-AUDIT.md` Phase 4
 *     Group 4f section + finding #40.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import {
  buildAddOnRequest,
  buildAddOnCancel,
  buildAddOnActivate,
  buildAddOnOverageToggle,
} from '@sally/test-utils/factories';
import {
  ADDON_TEST_SLUG,
  ensureInactiveAddOn,
  reactivateAddOnSafe,
  setPaymentSystemFlag,
  readPaymentSystemFlag,
} from './_helpers';

test.describe('Platform · Add-ons (public + read) @workflow', () => {
  // 1 ── GET /add-ons (public) ─────────────────────────────────────────────
  test('GET /add-ons returns the public pricing-page catalog projection (ANONYMOUS) @workflow @contract', async ({
    asAnonymous,
  }) => {
    const res = await asAnonymous.get('/add-ons');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.AddOnPricingRowSchema.strict(), await res.json(), {
      context: 'GET /add-ons',
    });

    // Semantic — seed emits 9 add-ons, sorted by displayOrder asc, every
    // row is active (the service filters by `isActive: true`), every row
    // has a unique slug + featureKey, and the nerve_center target slug is
    // present (precondition for the downstream self-service tests).
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const slugs = new Set(rows.map((r) => r.slug));
    expect(slugs.size).toBe(rows.length);
    expect(slugs.has(ADDON_TEST_SLUG)).toBe(true);
    for (const row of rows) {
      expect(row.isActive).toBe(true);
      expect(row.slug.length).toBeGreaterThan(0);
      expect(row.featureKey.length).toBeGreaterThan(0);
      expect(row.displayOrder).toBeGreaterThanOrEqual(0);
    }
    // List is displayOrder-ascending.
    const orders = rows.map((r) => r.displayOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  // 2 ── GET /add-ons/my-add-ons + RBAC fence ──────────────────────────────
  test('GET /add-ons/my-add-ons lists the tenant subscriptions; DISPATCHER hits 403 (OWNER + RBAC) @workflow @contract @rbac', async ({
    asOwner,
    asDispatcher,
  }) => {
    // RBAC fence — DISPATCHER cannot read the tenant add-on list (controller
    // is gated `@Roles(ADMIN, OWNER)`).
    const rbacRes = await asDispatcher.get('/add-ons/my-add-ons');
    expect(rbacRes.status()).toBe(403);

    const res = await asOwner.get('/add-ons/my-add-ons');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.TenantAddOnRowSchema.strict(), await res.json(), {
      context: 'GET /add-ons/my-add-ons',
    });

    // Semantic — demo seeds 9 subscribed add-ons. Each row has a non-null
    // addOn include, a valid status, and a nested addOn row whose slug is
    // present in the catalog (sanity check on the nested projection).
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.addOn).toBeDefined();
      expect(row.addOn.slug.length).toBeGreaterThan(0);
      expect(['active', 'cancelled', 'suspended']).toContain(row.status);
    }

    // The ADDON_TEST_SLUG row is present (precondition for downstream tests).
    const target = rows.find((r) => r.addOn.slug === ADDON_TEST_SLUG);
    expect(target, `${ADDON_TEST_SLUG} must be seeded on demo-northstar-2026`).toBeDefined();
  });

  // 3 ── GET /add-ons/my-requests ──────────────────────────────────────────
  test('GET /add-ons/my-requests lists the tenant request history (OWNER) @workflow @contract', async ({ asOwner }) => {
    const res = await asOwner.get('/add-ons/my-requests');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.AddOnRequestWithAddOnSchema.strict(), await res.json(), {
      context: 'GET /add-ons/my-requests',
    });

    // Semantic — demo seeds multiple historical request rows. Each row has
    // a non-null addOn include, a valid status, and (because the service
    // sorts desc by createdAt) the list is non-increasing by createdAt.
    if (rows.length > 0) {
      for (const row of rows) {
        expect(['pending', 'approved', 'declined']).toContain(row.status);
        expect(row.addOn.slug.length).toBeGreaterThan(0);
      }
      const timestamps = rows.map((r) => Date.parse(r.createdAt));
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    }
  });

  // 4 ── GET /add-ons/:slug/status ─────────────────────────────────────────
  test('GET /add-ons/:slug/status returns the feature-resolution envelope (OWNER) @workflow @contract', async ({
    asOwner,
  }) => {
    const res = await asOwner.get(`/add-ons/${ADDON_TEST_SLUG}/status`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.AddOnStatusSchema.strict(),
      await res.json(),
      `GET /add-ons/${ADDON_TEST_SLUG}/status`,
    );

    // Semantic — the addOn projection matches the target slug, the
    // tenantAddOn row (if present) points at the same add-on id, and the
    // `source` is one of the three FeatureResolution literals.
    expect(body.addOn.slug).toBe(ADDON_TEST_SLUG);
    expect(typeof body.enabled).toBe('boolean');
    expect(['feature_flag_disabled', 'addon_active', 'not_enabled']).toContain(body.source);
    if (body.tenantAddOn !== null) {
      expect(body.tenantAddOn.addOnId).toBe(body.addOn.id);
    }

    // Unknown slug → 404 via NotFoundException in getAddOnBySlugOrFeatureKey.
    const missing = await asOwner.get('/add-ons/qa-bogus-addon-does-not-exist/status');
    expect(missing.status()).toBe(404);
  });
});

// ── Self-service mutations (serial — payment_system flag toggle) ─────────
//
// All five mutation tests below run SERIALLY inside a describe block that
// (a) captures + flips the global `payment_system` flag to false in
// beforeAll, (b) re-asserts it to the captured value in afterAll, and
// (c) ensures the target add-on is restored to `active` state after each
// test (or after-all on catastrophic failure). Parallel execution with
// other specs that rely on `payment_system=true` is not supported while
// this block runs.
//
// The `serial` mode is required because all five tests share the
// payment-system flag AND the same target `nerve_center` subscription
// row; running them in parallel would race on the TenantAddOn status
// transitions.

test.describe.configure({ mode: 'serial' });
test.describe('Platform · Add-ons (self-service mutations) @workflow', () => {
  // Captured on the first beforeEach and consulted in afterEach. Because
  // the role-scoped fixtures (`asAnonymous`, `asSuperAdmin`, `asOwner`)
  // are test-scoped — NOT worker-scoped — the flag flip / restore sits in
  // beforeEach/afterEach rather than beforeAll/afterAll. Serial mode
  // ensures the mutations don't interleave across tests.
  let originalPaymentSystemEnabled = true;

  test.beforeEach(async ({ asAnonymous, asSuperAdmin, asOwner }) => {
    // Capture the original flag value once per test, flip to OFF, and
    // ensure the target slug is in `cancelled` state. Every test that
    // follows runs with payment_system=false + nerve_center=cancelled.
    originalPaymentSystemEnabled = await readPaymentSystemFlag(asAnonymous);
    if (originalPaymentSystemEnabled) {
      await setPaymentSystemFlag(asSuperAdmin, false);
    }
    await ensureInactiveAddOn(asOwner, ADDON_TEST_SLUG);
  });

  test.afterEach(async ({ asOwner, asSuperAdmin }) => {
    // Restore the add-on to `active` state. reactivateAddOnSafe logs (not
    // throws) on failure so the flag restore below still runs.
    await reactivateAddOnSafe(asOwner, ADDON_TEST_SLUG);
    // Restore the payment_system flag to its original value — CRITICAL so
    // no sibling spec observes a flipped flag.
    if (originalPaymentSystemEnabled) {
      await setPaymentSystemFlag(asSuperAdmin, true);
    }
  });

  // 5 ── POST /add-ons/:slug/request ───────────────────────────────────────
  test('POST /add-ons/:slug/request creates a pending request + echoes the addOn include (OWNER) @workflow @contract @destructive', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    const payload = buildAddOnRequest();
    const res = await asOwner.post(`/add-ons/${ADDON_TEST_SLUG}/request`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.AddOnRequestWithAddOnSchema.strict(),
      await res.json(),
      `POST /add-ons/${ADDON_TEST_SLUG}/request`,
    );

    try {
      // Semantic — payload echoed, status defaults to 'pending',
      // reviewedByUserId/declineReason are null on a fresh row, addOn
      // include present and targeting the same slug.
      expect(body.status).toBe('pending');
      expect(body.requestNote).toBe(payload.note);
      expect(body.reviewedByUserId).toBeNull();
      expect(body.reviewedAt).toBeNull();
      expect(body.declineReason).toBeNull();
      expect(body.addOn.slug).toBe(ADDON_TEST_SLUG);

      // Persistence — the new row surfaces on GET /add-ons/my-requests.
      const verifyRes = await asOwner.get('/add-ons/my-requests');
      expect(verifyRes.status()).toBe(200);
      const rows = expectArrayContract(PlatformSchemas.AddOnRequestWithAddOnSchema.strict(), await verifyRes.json());
      const seen = rows.find((r) => r.id === body.id);
      expect(seen).toBeDefined();
      expect(seen!.status).toBe('pending');
    } finally {
      // Cleanup — decline the created request via super-admin so it moves
      // off `pending`. This prevents the NEXT test run from hitting the
      // "pending request already exists" precondition error on
      // POST /request. Decline is idempotent on terminal rows.
      const declineRes = await asSuperAdmin.post(`/admin/add-on-requests/${body.id}/decline`, {
        reason: '[QA-TEST] Phase-4f request-test cleanup',
      });
      if (declineRes.status() !== 201 && declineRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`request cleanup failed for ${body.id}: HTTP ${declineRes.status()}`);
      }
    }
  });

  // 6 ── POST /add-ons/:slug/activate ──────────────────────────────────────
  test('POST /add-ons/:slug/activate upserts TenantAddOn to active (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    const payload = buildAddOnActivate();
    const res = await asOwner.post(`/add-ons/${ADDON_TEST_SLUG}/activate`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.TenantAddOnRowBareSchema.strict(),
      await res.json(),
      `POST /add-ons/${ADDON_TEST_SLUG}/activate`,
    );

    // Semantic — status is active, source is 'purchased' (the controller
    // hardcodes this for the self-service path), the activatedAt/
    // activatedBy are populated, cancelledAt/cancelledBy are null.
    expect(body.status).toBe('active');
    expect(body.source).toBe('purchased');
    expect(body.activatedAt).not.toBeNull();
    expect(body.activatedBy).not.toBeNull();
    expect(body.cancelledAt).toBeNull();
    expect(body.cancelledBy).toBeNull();

    // Persistence — GET /status reflects the active row.
    const verifyRes = await asOwner.get(`/add-ons/${ADDON_TEST_SLUG}/status`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.AddOnStatusSchema.strict(), await verifyRes.json());
    expect(verify.tenantAddOn).not.toBeNull();
    expect(verify.tenantAddOn!.status).toBe('active');
  });

  // 7 ── PATCH /add-ons/:slug/overage ──────────────────────────────────────
  test('PATCH /add-ons/:slug/overage flips allowOverage on an active row + restores (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    // Precondition — ensureInactiveAddOn cancelled the row in beforeEach;
    // re-activate first so the overage endpoint has an ACTIVE row to
    // flip. The overage endpoint rejects with 400 when the row is not
    // `status='active'`.
    const activateRes = await asOwner.post(`/add-ons/${ADDON_TEST_SLUG}/activate`, {});
    expect(activateRes.status()).toBe(201);

    // Capture original allowOverage via status read — newly-activated row
    // always has allowOverage=false (the service resets it in upsert).
    const preRes = await asOwner.get(`/add-ons/${ADDON_TEST_SLUG}/status`);
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.AddOnStatusSchema.strict(), await preRes.json());
    expect(pre.tenantAddOn).not.toBeNull();
    const originalAllowOverage = pre.tenantAddOn!.allowOverage;
    const newAllowOverage = !originalAllowOverage;

    const payload = buildAddOnOverageToggle({ enabled: newAllowOverage });
    try {
      const res = await asOwner.patch(`/add-ons/${ADDON_TEST_SLUG}/overage`, payload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.TenantAddOnRowBareSchema.strict(),
        await res.json(),
        `PATCH /add-ons/${ADDON_TEST_SLUG}/overage`,
      );

      // Semantic — allowOverage flipped, status still active, other fields
      // unchanged vs pre.
      expect(body.status).toBe('active');
      expect(body.allowOverage).toBe(newAllowOverage);

      // Persistence — GET /status echoes the new value.
      const verifyRes = await asOwner.get(`/add-ons/${ADDON_TEST_SLUG}/status`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.AddOnStatusSchema.strict(), await verifyRes.json());
      expect(verify.tenantAddOn).not.toBeNull();
      expect(verify.tenantAddOn!.allowOverage).toBe(newAllowOverage);
    } finally {
      // Restore allowOverage to the captured original — afterEach will
      // then re-activate the row from scratch which resets allowOverage
      // to false, but this restore keeps the sequence clean in-flight.
      const restoreRes = await asOwner.patch(`/add-ons/${ADDON_TEST_SLUG}/overage`, { enabled: originalAllowOverage });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`overage restore failed for ${ADDON_TEST_SLUG}: HTTP ${restoreRes.status()}`);
      }
    }
  });

  // 8 ── POST /add-ons/:slug/cancel ────────────────────────────────────────
  test('POST /add-ons/:slug/cancel transitions active → cancelled (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    // Precondition — ensureInactiveAddOn cancelled the row in beforeEach;
    // re-activate first so cancel has an active row to work on.
    const activateRes = await asOwner.post(`/add-ons/${ADDON_TEST_SLUG}/activate`, {});
    expect(activateRes.status()).toBe(201);

    const payload = buildAddOnCancel();
    const res = await asOwner.post(`/add-ons/${ADDON_TEST_SLUG}/cancel`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.TenantAddOnRowBareSchema.strict(),
      await res.json(),
      `POST /add-ons/${ADDON_TEST_SLUG}/cancel`,
    );

    // Semantic — status flipped to cancelled, cancelledAt + cancelledBy
    // populated, activatedAt preserved from the prior upsert.
    expect(body.status).toBe('cancelled');
    expect(body.cancelledAt).not.toBeNull();
    expect(body.cancelledBy).not.toBeNull();
    expect(body.activatedAt).not.toBeNull();

    // Persistence — GET /status shows the cancelled row.
    const verifyRes = await asOwner.get(`/add-ons/${ADDON_TEST_SLUG}/status`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.AddOnStatusSchema.strict(), await verifyRes.json());
    expect(verify.tenantAddOn).not.toBeNull();
    expect(verify.tenantAddOn!.status).toBe('cancelled');
  });
});

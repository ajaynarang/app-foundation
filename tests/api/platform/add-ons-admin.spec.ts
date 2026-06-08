/**
 * Platform — Add-ons admin (Phase 4 Group 4f).
 *
 * Covers 9 endpoints across two SUPER_ADMIN controllers:
 *
 *   AddOnsCatalogAdminController (3 endpoints) — `@Controller('admin/add-ons')`
 *     1. GET   /admin/add-ons                                  — full catalog
 *     2. PATCH /admin/add-ons/:slug                            — update
 *     3. PATCH /admin/add-ons/:slug/provider-price             — set/clear price id
 *
 *   AddOnsAdminController (2 endpoints) — `@Controller('admin/tenants/:tenantId/add-ons')`
 *     4. GET   /admin/tenants/:tenantId/add-ons                — tenant list
 *     5. POST  /admin/tenants/:tenantId/add-ons/:slug/enable   — admin-enable
 *     (POST /admin/tenants/:tenantId/add-ons/:slug/cancel covered via the
 *      request-admin duplicate path below — same service call.)
 *
 *   AddOnsRequestAdminController (6 endpoints) — `@Controller('admin/add-on-requests')`
 *     6. GET   /admin/add-on-requests[?status=...]             — list + filter
 *     7. POST  /admin/add-on-requests/:id/decline              — decline
 *     8. POST  /admin/add-on-requests/:id/approve              — approve (→ activate)
 *     9. POST  /admin/add-on-requests/tenant/:tenantId/add-ons/:slug/cancel  — tenant cancel
 *     (GET /admin/add-on-requests/tenant/:tenantId/add-ons covered in
 *      tests 4 — same service call `listTenantAddOns`.)
 *     (POST /admin/add-on-requests/tenant/:tenantId/add-ons/:slug/activate
 *      is an alias of AddOnsAdminController `/enable` — same service path;
 *      not re-tested.)
 *
 * Target count: **9 tests** — covers the 5 unique write endpoints + 3
 * unique read paths + 1 duplicate cancel shape assertion. The RBAC fence
 * rides on test 1 (OWNER → 403 on `/admin/add-ons`) — a single fence test
 * suffices because every admin controller here is gated at the controller
 * level via `@Roles(UserRole.SUPER_ADMIN)`.
 *
 * Critical constraints:
 *   - **Global catalog mutations.** Tests 2 + 3 patch the global add-on
 *     catalog. Every write captures the original value via the admin
 *     list endpoint first, then restores it in afterEach. NEVER delete
 *     a catalog row — the admin controller exposes no delete endpoint,
 *     and even if it did, cascading FKs on TenantAddOn/AddOnRequest
 *     would reject the delete.
 *   - **Payment-system flag.** Tests 5, 8, and 9 indirectly exercise
 *     `activateAddOn` / `cancelAddOn` on the tenant's `nerve_center` row.
 *     When `payment_system=true` the Stripe sync collides (see
 *     `add-ons.spec.ts` for the full rationale). The admin-mutation
 *     describe block flips the flag OFF in beforeAll and restores in
 *     afterAll — mirror of the self-service spec.
 *   - **Target add-on: `nerve_center`.** Same rationale as the
 *     self-service spec. Catalog-mutation tests target `nerve_center`
 *     exclusively so both specs hammer the same row.
 *   - **Pending-request reuse.** Each admin-moderation test (decline,
 *     approve) creates a FRESH pending request via the self-service
 *     POST /add-ons/:slug/request path (as OWNER). The service rejects
 *     a request when a pending one already exists for the same
 *     (tenant, add-on), so tests drain existing pending rows by
 *     declining any leftover before creating a new one.
 *
 * Schema strategy:
 *   - 6 hand-written admin-specific schemas from `platform.ts` (the
 *     self-service spec and this spec share the same shape library). See
 *     `SCHEMA-AUDIT.md` Phase 4 Group 4f section + finding #40.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import {
  buildAddOnCatalogUpdate,
  buildAddOnProviderPriceUpdate,
  buildAddOnAdminEnable,
  buildAddOnCancel,
  buildAddOnApprove,
  buildAddOnDecline,
} from '@sally/test-utils/factories';
import {
  ADDON_TEST_SLUG,
  createPendingAddOnRequest,
  ensureInactiveAddOn,
  reactivateAddOnSafe,
  setPaymentSystemFlag,
  readPaymentSystemFlag,
} from './_helpers';

// Demo tenant DB id on the target env. Resolved dynamically in beforeAll
// (not hardcoded) so the spec survives re-seeds / env moves. Captured
// once per worker.
let DEMO_TENANT_DB_ID: number | null = null;

async function resolveDemoTenantDbId(
  asSuperAdmin: import('@sally/test-utils/playwright').RoleApiClient,
): Promise<number> {
  if (DEMO_TENANT_DB_ID !== null) return DEMO_TENANT_DB_ID;
  const tenantStringId = process.env.TENANT_ID;
  if (!tenantStringId) {
    throw new Error('resolveDemoTenantDbId: TENANT_ID env var is not set');
  }
  const res = await asSuperAdmin.get('/tenants');
  expect(res.status(), 'resolveDemoTenantDbId: GET /tenants precondition should return 200').toBe(200);
  const rows = (await res.json()) as Array<{
    id: number;
    tenantId: string;
  }>;
  const row = rows.find((r) => r.tenantId === tenantStringId);
  if (!row) {
    throw new Error(`resolveDemoTenantDbId: no tenant matches TENANT_ID='${tenantStringId}'`);
  }
  DEMO_TENANT_DB_ID = row.id;
  return DEMO_TENANT_DB_ID;
}

test.describe('Platform · Add-ons admin (read + catalog) @workflow', () => {
  // 1 ── GET /admin/add-ons + RBAC fence ───────────────────────────────────
  test('GET /admin/add-ons returns the full catalog; OWNER hits 403 (SUPER_ADMIN + RBAC) @workflow @contract @rbac', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    // RBAC fence — OWNER cannot read the admin catalog (controller is
    // gated `@Roles(SUPER_ADMIN)`).
    const rbacRes = await asOwner.get('/admin/add-ons');
    expect(rbacRes.status()).toBe(403);

    const res = await asSuperAdmin.get('/admin/add-ons');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.AddOnCatalogRowSchema.strict(), await res.json(), {
      context: 'GET /admin/add-ons',
    });

    // Semantic — every row has a non-empty slug + featureKey; displayOrder
    // ascending; the target slug is present. The admin list INCLUDES
    // inactive rows too (the service uses `listAllAddOns` which omits the
    // isActive filter) — we don't enforce a min-count because the seed
    // count can vary.
    expect(rows.length).toBeGreaterThan(0);
    const slugs = new Set(rows.map((r) => r.slug));
    expect(slugs.has(ADDON_TEST_SLUG)).toBe(true);
    for (const row of rows) {
      expect(row.slug.length).toBeGreaterThan(0);
      expect(row.featureKey.length).toBeGreaterThan(0);
    }
    const orders = rows.map((r) => r.displayOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  // 2 ── PATCH /admin/add-ons/:slug ────────────────────────────────────────
  test('PATCH /admin/add-ons/:slug updates the catalog row + restores (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asSuperAdmin,
  }) => {
    // Capture original description via the admin list.
    const preRes = await asSuperAdmin.get('/admin/add-ons');
    expect(preRes.status()).toBe(200);
    const preRows = expectArrayContract(PlatformSchemas.AddOnCatalogRowSchema.strict(), await preRes.json());
    const preTarget = preRows.find((r) => r.slug === ADDON_TEST_SLUG);
    expect(preTarget, `${ADDON_TEST_SLUG} must be present in the admin catalog`).toBeDefined();
    const originalDescription = preTarget!.description;

    const payload = buildAddOnCatalogUpdate();
    try {
      const res = await asSuperAdmin.patch(`/admin/add-ons/${ADDON_TEST_SLUG}`, payload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.AddOnCatalogRowSchema.strict(),
        await res.json(),
        `PATCH /admin/add-ons/${ADDON_TEST_SLUG}`,
      );

      // Semantic — description echoed, slug preserved, updatedAt advanced.
      expect(body.slug).toBe(ADDON_TEST_SLUG);
      expect(body.description).toBe(payload.description);
      expect(Date.parse(body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(preTarget!.updatedAt));

      // Persistence — second admin list read reflects the new description.
      const verifyRes = await asSuperAdmin.get('/admin/add-ons');
      expect(verifyRes.status()).toBe(200);
      const verifyRows = expectArrayContract(PlatformSchemas.AddOnCatalogRowSchema.strict(), await verifyRes.json());
      const verifyTarget = verifyRows.find((r) => r.slug === ADDON_TEST_SLUG);
      expect(verifyTarget).toBeDefined();
      expect(verifyTarget!.description).toBe(payload.description);
    } finally {
      // Restore — ALWAYS restore the original description. Catalog is
      // global; a leaked `[QA-TEST]` description would surface on every
      // tenant's pricing page.
      const restoreRes = await asSuperAdmin.patch(`/admin/add-ons/${ADDON_TEST_SLUG}`, {
        description: originalDescription,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`admin/add-ons catalog restore failed for ${ADDON_TEST_SLUG}: HTTP ${restoreRes.status()}`);
      }
    }
  });

  // 3 ── PATCH /admin/add-ons/:slug/provider-price ─────────────────────────
  test('PATCH /admin/add-ons/:slug/provider-price writes the price id + restores null (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asSuperAdmin,
  }) => {
    // Capture the original providerPriceId (nerve_center ships null on
    // demo-northstar-2026). The restore PATCH sends `{providerPriceId: null}`
    // — the service's `updateProviderPriceId` stores null as-is.
    const preRes = await asSuperAdmin.get('/admin/add-ons');
    expect(preRes.status()).toBe(200);
    const preRows = expectArrayContract(PlatformSchemas.AddOnCatalogRowSchema.strict(), await preRes.json());
    const preTarget = preRows.find((r) => r.slug === ADDON_TEST_SLUG);
    expect(preTarget).toBeDefined();
    const originalPriceId = preTarget!.providerPriceId;

    const payload = buildAddOnProviderPriceUpdate();
    try {
      const res = await asSuperAdmin.patch(`/admin/add-ons/${ADDON_TEST_SLUG}/provider-price`, payload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.AddOnCatalogRowSchema.strict(),
        await res.json(),
        `PATCH /admin/add-ons/${ADDON_TEST_SLUG}/provider-price`,
      );

      expect(body.slug).toBe(ADDON_TEST_SLUG);
      expect(body.providerPriceId).toBe(payload.providerPriceId);

      // Persistence — admin list reflects the new price id.
      const verifyRes = await asSuperAdmin.get('/admin/add-ons');
      expect(verifyRes.status()).toBe(200);
      const verifyRows = expectArrayContract(PlatformSchemas.AddOnCatalogRowSchema.strict(), await verifyRes.json());
      const verifyTarget = verifyRows.find((r) => r.slug === ADDON_TEST_SLUG);
      expect(verifyTarget).toBeDefined();
      expect(verifyTarget!.providerPriceId).toBe(payload.providerPriceId);
    } finally {
      const restoreRes = await asSuperAdmin.patch(`/admin/add-ons/${ADDON_TEST_SLUG}/provider-price`, {
        providerPriceId: originalPriceId,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`admin provider-price restore failed for ${ADDON_TEST_SLUG}: HTTP ${restoreRes.status()}`);
      }
    }
  });

  // 4 ── GET /admin/tenants/:tenantId/add-ons ──────────────────────────────
  test('GET /admin/tenants/:tenantId/add-ons lists the tenant subscriptions (SUPER_ADMIN) @workflow @contract', async ({
    asSuperAdmin,
  }) => {
    const tenantDbId = await resolveDemoTenantDbId(asSuperAdmin);

    const res = await asSuperAdmin.get(`/admin/tenants/${tenantDbId}/add-ons`);
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.TenantAddOnRowSchema.strict(), await res.json(), {
      context: `GET /admin/tenants/${tenantDbId}/add-ons`,
    });

    // Semantic — demo seeds 9 rows; the ADDON_TEST_SLUG row is present
    // with a valid status; each row's addOn include has the matching id.
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['active', 'cancelled', 'suspended']).toContain(row.status);
      expect(row.addOn.id).toBe(row.addOnId);
    }
    const target = rows.find((r) => r.addOn.slug === ADDON_TEST_SLUG);
    expect(target).toBeDefined();
  });

  // 6 ── GET /admin/add-on-requests (+ status filter) ──────────────────────
  //
  // Declared here (out-of-order relative to the test numbering above) so the
  // read-side assertions stay in this "read + catalog" describe block. The
  // write-side admin moderation tests (decline/approve/cancel) live in the
  // serial block below.
  test('GET /admin/add-on-requests lists all requests with status filter (SUPER_ADMIN) @workflow @contract', async ({
    asSuperAdmin,
  }) => {
    // Full list — every row has the 3 include projections populated.
    const res = await asSuperAdmin.get('/admin/add-on-requests');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.AddOnRequestAdminRowSchema.strict(), await res.json(), {
      context: 'GET /admin/add-on-requests',
    });

    // Semantic — list is desc by createdAt, statuses are valid, addOnActive
    // is a boolean on every row, rows are sorted.
    if (rows.length > 0) {
      for (const row of rows) {
        expect(['pending', 'approved', 'declined']).toContain(row.status);
        expect(typeof row.addOnActive).toBe('boolean');
        expect(row.addOn.slug.length).toBeGreaterThan(0);
        expect(row.tenant.tenantId.length).toBeGreaterThan(0);
      }
      const timestamps = rows.map((r) => Date.parse(r.createdAt));
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    }

    // Filtered — ?status=declined returns only declined rows.
    const declinedRes = await asSuperAdmin.get('/admin/add-on-requests?status=declined');
    expect(declinedRes.status()).toBe(200);
    const declined = expectArrayContract(PlatformSchemas.AddOnRequestAdminRowSchema.strict(), await declinedRes.json());
    for (const row of declined) {
      expect(row.status).toBe('declined');
    }
  });
});

// ── Admin mutations that go through activateAddOn / cancelAddOn ──────────
//
// Serial block — same payment_system flag-flip pattern as the self-service
// spec. Tests 5, 8, 9 all invoke the service's `activateAddOn` or
// `cancelAddOn` paths, which hit the Stripe-sync branch when
// `payment_system=true`. Flip OFF in beforeEach, restore in afterEach.
//
// Test 7 (decline) does NOT go through activate/cancel — it only updates
// the AddOnRequest row — so it would work with the flag ON, but keeping
// the entire block serialised simplifies the shared-target-row state
// management. The bootstrap (`createPendingAddOnRequest`) DOES depend on
// the payment_system flag being OFF (it calls POST /request, and the
// service's createRequest goes through a transaction with activate on
// approve — we need to leave space for the downstream approve test).

test.describe.configure({ mode: 'serial' });
test.describe('Platform · Add-ons admin (moderation) @workflow', () => {
  let originalPaymentSystemEnabled = true;

  test.beforeEach(async ({ asAnonymous, asSuperAdmin, asOwner }) => {
    originalPaymentSystemEnabled = await readPaymentSystemFlag(asAnonymous);
    if (originalPaymentSystemEnabled) {
      await setPaymentSystemFlag(asSuperAdmin, false);
    }
    // Ensure inactive state so request/activate/cancel paths are clean.
    await ensureInactiveAddOn(asOwner, ADDON_TEST_SLUG);
  });

  test.afterEach(async ({ asOwner, asSuperAdmin }) => {
    await reactivateAddOnSafe(asOwner, ADDON_TEST_SLUG);
    if (originalPaymentSystemEnabled) {
      await setPaymentSystemFlag(asSuperAdmin, true);
    }
  });

  // 5 ── POST /admin/tenants/:tenantId/add-ons/:slug/enable ────────────────
  test('POST /admin/tenants/:tenantId/add-ons/:slug/enable activates + echoes TenantAddOn row (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asSuperAdmin,
  }) => {
    const tenantDbId = await resolveDemoTenantDbId(asSuperAdmin);

    const payload = buildAddOnAdminEnable();
    const res = await asSuperAdmin.post(`/admin/tenants/${tenantDbId}/add-ons/${ADDON_TEST_SLUG}/enable`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.TenantAddOnRowBareSchema.strict(),
      await res.json(),
      `POST /admin/tenants/${tenantDbId}/add-ons/${ADDON_TEST_SLUG}/enable`,
    );

    // Semantic — status active, source='admin' (hardcoded in the admin
    // controller), priceCents echoed from the DTO payload, activatedAt
    // populated.
    expect(body.tenantId).toBe(tenantDbId);
    expect(body.status).toBe('active');
    expect(body.source).toBe('admin');
    expect(body.priceCents).toBe(payload.priceCents);
    expect(body.activatedAt).not.toBeNull();
    expect(body.activatedBy).not.toBeNull();

    // Persistence — admin tenant-list reflects the active row.
    const verifyRes = await asSuperAdmin.get(`/admin/tenants/${tenantDbId}/add-ons`);
    expect(verifyRes.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.TenantAddOnRowSchema.strict(), await verifyRes.json());
    const seen = rows.find((r) => r.addOn.slug === ADDON_TEST_SLUG);
    expect(seen).toBeDefined();
    expect(seen!.status).toBe('active');
  });

  // 7 ── POST /admin/add-on-requests/:id/decline ───────────────────────────
  test('POST /admin/add-on-requests/:id/decline transitions pending → declined (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    // Bootstrap — create a fresh pending request as OWNER.
    const pending = await createPendingAddOnRequest(asOwner, ADDON_TEST_SLUG);

    const payload = buildAddOnDecline();
    const res = await asSuperAdmin.post(`/admin/add-on-requests/${pending.id}/decline`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.AddOnRequestRowBareSchema.strict(),
      await res.json(),
      `POST /admin/add-on-requests/${pending.id}/decline`,
    );

    // Semantic — status flipped to 'declined', reviewedByUserId +
    // reviewedAt populated, declineReason echoed from the DTO.
    expect(body.id).toBe(pending.id);
    expect(body.status).toBe('declined');
    expect(body.declineReason).toBe(payload.reason);
    expect(body.reviewedByUserId).not.toBeNull();
    expect(body.reviewedAt).not.toBeNull();

    // Persistence — the admin list sees the declined row.
    const verifyRes = await asSuperAdmin.get('/admin/add-on-requests?status=declined');
    expect(verifyRes.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.AddOnRequestAdminRowSchema.strict(), await verifyRes.json());
    const seen = rows.find((r) => r.id === pending.id);
    expect(seen).toBeDefined();
    expect(seen!.status).toBe('declined');
    expect(seen!.declineReason).toBe(payload.reason);
  });

  // 8 ── POST /admin/add-on-requests/:id/approve ───────────────────────────
  test('POST /admin/add-on-requests/:id/approve transitions pending → approved + activates (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    // Bootstrap — fresh pending request.
    const pending = await createPendingAddOnRequest(asOwner, ADDON_TEST_SLUG);

    const payload = buildAddOnApprove();
    const res = await asSuperAdmin.post(`/admin/add-on-requests/${pending.id}/approve`, payload);
    expect(res.status()).toBe(201);
    // Approve returns the TenantAddOn row (the terminal activation), NOT
    // the AddOnRequest row — the service's `approveRequest` returns the
    // return value of `activateAddOn` after the tx commits.
    const body = expectContract(
      PlatformSchemas.TenantAddOnRowBareSchema.strict(),
      await res.json(),
      `POST /admin/add-on-requests/${pending.id}/approve`,
    );

    // Semantic — TenantAddOn row is now active, source='gifted' because
    // payload.giftedPriceCents was set, priceCents matches the gift amount,
    // and the SuperAdmin's db id is recorded as activatedBy.
    expect(body.status).toBe('active');
    expect(body.source).toBe('gifted');
    expect(body.priceCents).toBe(payload.giftedPriceCents);
    expect(body.addOnId).toBe(pending.addOnId);

    // Persistence — the request row's status is now 'approved' + the
    // review fields are populated.
    const verifyRes = await asSuperAdmin.get('/admin/add-on-requests');
    expect(verifyRes.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.AddOnRequestAdminRowSchema.strict(), await verifyRes.json());
    const seen = rows.find((r) => r.id === pending.id);
    expect(seen).toBeDefined();
    expect(seen!.status).toBe('approved');
    expect(seen!.reviewedAt).not.toBeNull();
    expect(seen!.addOnActive).toBe(true);
  });

  // 9 ── POST /admin/add-on-requests/tenant/:tenantId/add-ons/:slug/cancel ──
  test('POST /admin/add-on-requests/tenant/:tenantId/add-ons/:slug/cancel cancels tenant add-on (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    const tenantDbId = await resolveDemoTenantDbId(asSuperAdmin);

    // Precondition — beforeEach cancelled the row; re-activate via the
    // admin enable path so cancel has an active row to work on.
    const enablePayload = buildAddOnAdminEnable();
    const enableRes = await asSuperAdmin.post(
      `/admin/tenants/${tenantDbId}/add-ons/${ADDON_TEST_SLUG}/enable`,
      enablePayload,
    );
    expect(enableRes.status()).toBe(201);

    const payload = buildAddOnCancel();
    const res = await asSuperAdmin.post(
      `/admin/add-on-requests/tenant/${tenantDbId}/add-ons/${ADDON_TEST_SLUG}/cancel`,
      payload,
    );
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.TenantAddOnRowBareSchema.strict(),
      await res.json(),
      `POST /admin/add-on-requests/tenant/${tenantDbId}/add-ons/${ADDON_TEST_SLUG}/cancel`,
    );

    // Semantic — row flipped to cancelled, cancelledAt/cancelledBy populated,
    // activatedAt preserved, tenantId echoed.
    expect(body.tenantId).toBe(tenantDbId);
    expect(body.status).toBe('cancelled');
    expect(body.cancelledAt).not.toBeNull();
    expect(body.cancelledBy).not.toBeNull();
    expect(body.activatedAt).not.toBeNull();

    // Persistence — admin tenant-list reflects the cancelled row.
    const verifyRes = await asSuperAdmin.get(`/admin/tenants/${tenantDbId}/add-ons`);
    expect(verifyRes.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.TenantAddOnRowSchema.strict(), await verifyRes.json());
    const seen = rows.find((r) => r.addOn.slug === ADDON_TEST_SLUG);
    expect(seen).toBeDefined();
    expect(seen!.status).toBe('cancelled');
  });
});

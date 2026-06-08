/**
 * Platform — Plans (Phase 4 Group 4e).
 *
 * Covers all 7 endpoints on `PlansController` (per live read of
 * `apps/backend/src/domains/platform/plans/plans.controller.ts`).
 * Controller declaration order:
 *
 *   Public (no auth)
 *     1. GET   /plans
 *
 *   Authenticated (DISPATCHER/ADMIN/OWNER)
 *     2. GET   /plans/my-plan
 *
 *   SUPER_ADMIN-gated
 *     3. GET   /plans/tenant/:tenantId
 *     4. PATCH /plans/tenant/:tenantId
 *     5. PATCH /plans/:plan/provider-price
 *     6. PATCH /plans/:plan
 *     7. PATCH /plans/:plan/entitlements/:feature
 *
 * Target count: **7 tests** — one per endpoint plus one RBAC 403 fence
 * embedded inside the SUPER_ADMIN list (test 3 probes the DISPATCHER
 * path first to assert 403, then retries as SUPER_ADMIN; test 6 also
 * re-asserts RBAC by proving DISPATCHER→403 on PATCH /plans/STARTER).
 *
 * Critical constraints (§8 risks):
 *   - **Global mutations.** Every PATCH /plans/:plan* writes to the
 *     `plan_configs` or `plan_entitlements` table — GLOBAL state shared
 *     across every tenant. Tests MUST capture the original value before
 *     the write and restore it in afterEach (mirrors the feature-flags
 *     pattern from Group 4a).
 *   - **Plan target: STARTER.** demo-northstar-2026 runs on PROFESSIONAL,
 *     so STARTER is effectively observer-only for the QA tenant. All
 *     plan-config / provider-price / entitlement tests target STARTER
 *     so a stray half-written value cannot break the demo tenant even
 *     if the afterEach restore fails.
 *   - **Plan assignment target: a non-demo tenant.** PATCH
 *     /plans/tenant/:id MUST NOT mutate demo-northstar-2026's plan.
 *     The `firstAssignableTenantId` helper picks a non-demo,
 *     non-SUSPENDED tenant; the test captures the original plan and
 *     restores it in afterEach. Gated by
 *     `@requires:data-assignable-tenant` when no candidate exists.
 *
 * Schema strategy:
 *   - Shared-types `PlanConfigSchema` + `PlanEventSchema` both MISS live
 *     fields (`isActive`, `createdAt`, `updatedAt` on PlanConfig;
 *     `tenantId` on PlanEvent) — hand-written locally. Finding #39.
 *   - PATCH /plans/tenant/:id returns `TenantRowSchema` (full Prisma row,
 *     no includes) — reused from Group 4c.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import {
  buildPlanUpdate,
  buildPlanProviderPriceUpdate,
  buildPlanAssignment,
  buildPlanEntitlementToggle,
} from '@sally/test-utils/factories';
import { firstAssignableTenantId, demoTenantId } from './_helpers';

// Target plan for every plan-config / provider-price / entitlement test.
// STARTER is the lowest-blast-radius plan on demo-northstar-2026 (which
// runs PROFESSIONAL), so mutations here cannot affect the QA tenant even
// if a restore fails.
const TEST_PLAN = 'STARTER';
// Pick an entitlement that's DISABLED on STARTER by default (so the flip
// is from false→true→false and we don't accidentally turn off a feature
// the tenant relies on). `quickbooks_integration` is stable across dev
// seeds; if the fixture ever changes, the test fails loudly on the
// precondition GET.
const TEST_ENTITLEMENT_FEATURE = 'quickbooks_integration';

test.describe('Platform · Plans @workflow', () => {
  // 1 ── GET /plans ──────────────────────────────────────────────────────
  test('GET /plans returns the public plan-config list with entitlements (ANONYMOUS) @workflow @contract', async ({
    asAnonymous,
  }) => {
    const res = await asAnonymous.get('/plans');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.PlanConfigResponseSchema.strict(), await res.json(), {
      context: 'GET /plans',
    });

    // Semantic — demo seeds 3 plans (STARTER / PROFESSIONAL / ENTERPRISE).
    // Every row has a non-empty displayName, non-negative displayOrder,
    // and a non-empty entitlements array. The target plan is present.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const plans = new Set(rows.map((r) => r.plan));
    expect(plans.has(TEST_PLAN)).toBe(true);
    for (const row of rows) {
      expect(row.displayName.length).toBeGreaterThan(0);
      expect(row.displayOrder).toBeGreaterThanOrEqual(0);
      expect(row.entitlements.length).toBeGreaterThan(0);
      expect(row.isActive).toBe(true);
    }

    // Rows are displayOrder-ascending.
    const orders = rows.map((r) => r.displayOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  // 2 ── GET /plans/my-plan ──────────────────────────────────────────────
  test('GET /plans/my-plan returns the caller tenant plan + entitlements (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/plans/my-plan');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.TenantPlanDetailsResponseSchema.strict(),
      await res.json(),
      'GET /plans/my-plan',
    );

    // Semantic — demo tenant runs PROFESSIONAL. The planConfig is
    // populated (non-null), vehicleCount matches the seeded fleet count
    // (>=0), and planEvents is bounded at 10 rows desc by createdAt.
    expect(body.plan).toBe('PROFESSIONAL');
    expect(body.planConfig).not.toBeNull();
    expect(body.planConfig!.plan).toBe('PROFESSIONAL');
    expect(body.vehicleCount).toBeGreaterThanOrEqual(0);
    expect(body.planEvents.length).toBeLessThanOrEqual(10);
    // Persistence — a second call returns the same plan (cache warm).
    const second = await asDispatcher.get('/plans/my-plan');
    expect(second.status()).toBe(200);
    const secondBody = expectContract(PlatformSchemas.TenantPlanDetailsResponseSchema.strict(), await second.json());
    expect(secondBody.plan).toBe(body.plan);
  });

  // 3 ── GET /plans/tenant/:tenantId (SUPER_ADMIN) + RBAC fence ──────────
  test('GET /plans/tenant/:tenantId returns the tenant plan envelope; DISPATCHER hits 403 (SUPER_ADMIN + RBAC) @workflow @contract @rbac', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const tenantId = demoTenantId();

    // RBAC fence — the cross-tenant plan lookup is SUPER_ADMIN-only.
    const rbacRes = await asDispatcher.get(`/plans/tenant/${tenantId}`);
    expect(rbacRes.status()).toBe(403);

    // Happy path.
    const res = await asSuperAdmin.get(`/plans/tenant/${tenantId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.TenantPlanDetailsResponseSchema.strict(),
      await res.json(),
      `GET /plans/tenant/${tenantId}`,
    );

    // Semantic — same tenant as /my-plan, same plan (PROFESSIONAL).
    expect(body.plan).toBe('PROFESSIONAL');
    expect(body.planConfig).not.toBeNull();
    expect(body.planConfig!.plan).toBe('PROFESSIONAL');

    // Unknown tenant → 404 via findUniqueOrThrow.
    const missing = await asSuperAdmin.get('/plans/tenant/qa-bogus-tenant-id-does-not-exist');
    expect(missing.status()).toBe(404);
  });

  // 4 ── PATCH /plans/tenant/:tenantId ──────────────────────────────────
  test('PATCH /plans/tenant/:tenantId assigns a plan to a non-demo tenant + restores (SUPER_ADMIN) @workflow @destructive @requires:data-assignable-tenant', async ({
    asSuperAdmin,
  }) => {
    const target = await firstAssignableTenantId(asSuperAdmin);
    // Pick a plan different from the tenant's current plan so the state
    // change is provably observable. STARTER is always safe (lowest
    // entitlements); if the tenant is ALREADY on STARTER, we flip to
    // TRIAL instead.
    const newPlan = target.originalPlan === 'STARTER' ? 'TRIAL' : 'STARTER';
    const payload = buildPlanAssignment({ plan: newPlan });

    let assignedSuccessfully = false;
    try {
      const res = await asSuperAdmin.patch(`/plans/tenant/${target.tenantId}`, payload);
      expect(res.status()).toBe(200);
      // The service returns the raw Prisma Tenant row (no includes) —
      // matches TenantRowSchema from Group 4c.
      const body = expectContract(
        PlatformSchemas.TenantRowSchema.strict(),
        await res.json(),
        `PATCH /plans/tenant/${target.tenantId}`,
      );
      expect(body.tenantId).toBe(target.tenantId);
      expect(body.plan).toBe(newPlan);
      expect(body.planAssignedAt).not.toBeNull();
      expect(body.planAssignedBy).not.toBeNull();
      assignedSuccessfully = true;

      // Persistence — GET returns the new plan + a fresh plan event
      // with `fromPlan` = original, `toPlan` = new.
      const verifyRes = await asSuperAdmin.get(`/plans/tenant/${target.tenantId}`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.TenantPlanDetailsResponseSchema.strict(), await verifyRes.json());
      expect(verify.plan).toBe(newPlan);
      // Latest event (first in desc order) matches the transition.
      expect(verify.planEvents.length).toBeGreaterThan(0);
      const latest = verify.planEvents[0];
      expect(latest.fromPlan).toBe(target.originalPlan);
      expect(latest.toPlan).toBe(newPlan);
      expect(latest.reason).toBe(payload.reason);
    } finally {
      // Restore — CRITICAL: never leave the tenant's plan mutated. If the
      // assignment itself failed before mutation landed, skip the restore;
      // otherwise issue a PATCH with the captured original plan.
      if (assignedSuccessfully) {
        const restoreRes = await asSuperAdmin.patch(
          `/plans/tenant/${target.tenantId}`,
          buildPlanAssignment({
            plan: target.originalPlan,
            reason: '[QA-TEST] Phase-4e plan-assignment restore',
          }),
        );
        if (restoreRes.status() !== 200) {
          // eslint-disable-next-line no-console
          console.error(`plans restore failed for tenant ${target.tenantId}: HTTP ${restoreRes.status()}`);
        }
      }
    }
  });

  // 5 ── PATCH /plans/:plan/provider-price ──────────────────────────────
  test('PATCH /plans/:plan/provider-price writes the Stripe price id + restores (SUPER_ADMIN) @workflow @destructive', async ({
    asAnonymous,
    asSuperAdmin,
  }) => {
    // Capture original providerPriceId.
    const preRes = await asAnonymous.get('/plans');
    expect(preRes.status()).toBe(200);
    const preRows = expectArrayContract(PlatformSchemas.PlanConfigResponseSchema.strict(), await preRes.json());
    const target = preRows.find((r) => r.plan === TEST_PLAN);
    expect(target).toBeDefined();
    const originalPriceId = target!.providerPriceId;

    const payload = buildPlanProviderPriceUpdate();

    try {
      const res = await asSuperAdmin.patch(`/plans/${TEST_PLAN}/provider-price`, payload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.PlanConfigBareSchema.strict(),
        await res.json(),
        `PATCH /plans/${TEST_PLAN}/provider-price`,
      );
      expect(body.plan).toBe(TEST_PLAN);
      expect(body.providerPriceId).toBe(payload.providerPriceId);

      // Persistence — second GET reflects the new id.
      const verifyRes = await asAnonymous.get('/plans');
      expect(verifyRes.status()).toBe(200);
      const verifyRows = expectArrayContract(PlatformSchemas.PlanConfigResponseSchema.strict(), await verifyRes.json());
      const verifyTarget = verifyRows.find((r) => r.plan === TEST_PLAN);
      expect(verifyTarget).toBeDefined();
      expect(verifyTarget!.providerPriceId).toBe(payload.providerPriceId);
    } finally {
      // Restore — same payload shape, captured original value.
      const restoreRes = await asSuperAdmin.patch(`/plans/${TEST_PLAN}/provider-price`, {
        providerPriceId: originalPriceId,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`plans provider-price restore failed for ${TEST_PLAN}: HTTP ${restoreRes.status()}`);
      }
    }
  });

  // 6 ── PATCH /plans/:plan ──────────────────────────────────────────────
  test('PATCH /plans/:plan updates plan config + restores; DISPATCHER hits 403 (SUPER_ADMIN + RBAC) @workflow @destructive @rbac', async ({
    asDispatcher,
    asAnonymous,
    asSuperAdmin,
  }) => {
    // RBAC fence.
    const rbacRes = await asDispatcher.patch(`/plans/${TEST_PLAN}`, buildPlanUpdate());
    expect(rbacRes.status()).toBe(403);

    // Capture original displayName via the public list endpoint.
    const preRes = await asAnonymous.get('/plans');
    expect(preRes.status()).toBe(200);
    const preRows = expectArrayContract(PlatformSchemas.PlanConfigResponseSchema.strict(), await preRes.json());
    const target = preRows.find((r) => r.plan === TEST_PLAN);
    expect(target).toBeDefined();
    const originalDisplayName = target!.displayName;

    const payload = buildPlanUpdate();

    try {
      const res = await asSuperAdmin.patch(`/plans/${TEST_PLAN}`, payload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.PlanConfigBareSchema.strict(),
        await res.json(),
        `PATCH /plans/${TEST_PLAN}`,
      );
      expect(body.plan).toBe(TEST_PLAN);
      expect(body.displayName).toBe(payload.displayName);
      // updatedAt must advance past the original.
      expect(Date.parse(body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(target!.updatedAt));

      // Persistence.
      const verifyRes = await asAnonymous.get('/plans');
      expect(verifyRes.status()).toBe(200);
      const verifyRows = expectArrayContract(PlatformSchemas.PlanConfigResponseSchema.strict(), await verifyRes.json());
      const verifyTarget = verifyRows.find((r) => r.plan === TEST_PLAN);
      expect(verifyTarget).toBeDefined();
      expect(verifyTarget!.displayName).toBe(payload.displayName);
    } finally {
      const restoreRes = await asSuperAdmin.patch(`/plans/${TEST_PLAN}`, {
        displayName: originalDisplayName,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`plans config restore failed for ${TEST_PLAN}: HTTP ${restoreRes.status()}`);
      }
    }
  });

  // 7 ── PATCH /plans/:plan/entitlements/:feature ───────────────────────
  test('PATCH /plans/:plan/entitlements/:feature flips one entitlement + restores (SUPER_ADMIN) @workflow @destructive', async ({
    asAnonymous,
    asSuperAdmin,
  }) => {
    // Capture original enabled value.
    const preRes = await asAnonymous.get('/plans');
    expect(preRes.status()).toBe(200);
    const preRows = expectArrayContract(PlatformSchemas.PlanConfigResponseSchema.strict(), await preRes.json());
    const target = preRows.find((r) => r.plan === TEST_PLAN);
    expect(target).toBeDefined();
    const targetEntitlement = target!.entitlements.find((e) => e.feature === TEST_ENTITLEMENT_FEATURE);
    expect(targetEntitlement, `${TEST_ENTITLEMENT_FEATURE} entitlement must exist on ${TEST_PLAN}`).toBeDefined();
    const originalEnabled = targetEntitlement!.enabled;
    const newEnabled = !originalEnabled;

    const payload = buildPlanEntitlementToggle({ enabled: newEnabled });

    try {
      const res = await asSuperAdmin.patch(`/plans/${TEST_PLAN}/entitlements/${TEST_ENTITLEMENT_FEATURE}`, payload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.PlanEntitlementRowSchema.strict(),
        await res.json(),
        `PATCH /plans/${TEST_PLAN}/entitlements/${TEST_ENTITLEMENT_FEATURE}`,
      );
      expect(body.plan).toBe(TEST_PLAN);
      expect(body.feature).toBe(TEST_ENTITLEMENT_FEATURE);
      expect(body.enabled).toBe(newEnabled);

      // Persistence — the public /plans list reflects the new value.
      const verifyRes = await asAnonymous.get('/plans');
      expect(verifyRes.status()).toBe(200);
      const verifyRows = expectArrayContract(PlatformSchemas.PlanConfigResponseSchema.strict(), await verifyRes.json());
      const verifyTarget = verifyRows.find((r) => r.plan === TEST_PLAN);
      const verifyEnt = verifyTarget!.entitlements.find((e) => e.feature === TEST_ENTITLEMENT_FEATURE);
      expect(verifyEnt).toBeDefined();
      expect(verifyEnt!.enabled).toBe(newEnabled);
    } finally {
      const restoreRes = await asSuperAdmin.patch(`/plans/${TEST_PLAN}/entitlements/${TEST_ENTITLEMENT_FEATURE}`, {
        enabled: originalEnabled,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(
          `plans entitlement restore failed for ${TEST_PLAN}/${TEST_ENTITLEMENT_FEATURE}: HTTP ${restoreRes.status()}`,
        );
      }
    }
  });
});

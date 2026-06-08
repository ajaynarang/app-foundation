/**
 * Fleet — Loads Charges API (Phase 1 Group 7a)
 *
 * Covers the charge sub-resource endpoints on `LoadsController`:
 *
 *   - POST   /loads/:load_id/charges              → add a charge
 *   - GET    /loads/:load_id/charges              → list charges for a load
 *   - PATCH  /loads/:load_id/charges/:charge_id   → update a charge
 *   - DELETE /loads/:load_id/charges/:charge_id   → remove a charge
 *
 * Role rules (from `@Roles` decorators, lines 816-886 of loads.controller.ts):
 *   - All four endpoints → DISPATCHER, ADMIN, OWNER. We use `asDispatcher`.
 *
 * Setup pattern: every test uses `createAssignedLoad(asDispatcher, asAdmin)`
 * from `_helpers.ts` to bootstrap a PENDING→ASSIGNED load plus a freshly-
 * provisioned driver. The driver is created here only because
 * `createAssignedLoad` always provisions one via POST /drivers (ADMIN-only)
 * before assigning — charges themselves are billing entities that do not
 * care about the load's driver. We still run through the full setup so
 * cleanup is uniform with the rest of this directory.
 *
 * Charge-editable window: `LoadChargesService.assertChargesEditable`
 * forbids mutation after the load is APPROVED or INVOICED. Newly-created
 * loads default to `billingStatus: 'DRAFT'` in `LoadCreationService`, so
 * every mutation test here stays in the editable window.
 *
 * Schema: `LoadSubresourceSchemas.LoadChargeSchema` — hand-written to
 * mirror `formatChargeResponse` in the service (see
 * `packages/test-utils/src/schemas/load-subresources.ts` for the source
 * notes on why we do not re-export from shared-types).
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLoadCharge } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectArrayContract, expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import { createAssignedLoad } from './_helpers.js';

const { LoadChargeSchema } = LoadSubresourceSchemas;

test.describe('Fleet · Loads Charges @workflow', () => {
  // Load ids to clean up. Charges cascade-delete with the parent load on
  // `DELETE /loads/:id` — no separate charge cleanup needed here.
  const createdLoadIds: string[] = [];
  // Drivers provisioned by `createAssignedLoad`. Deactivated in afterEach
  // so repeated test runs do not pile up active drivers on the tenant.
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await asAdmin.post(`/drivers/${driverId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  // 1 ── POST /loads/:load_id/charges ────────────────────────────────
  test('POST /loads/:load_id/charges creates a charge with derived totalCents @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const payload = buildLoadCharge({
      chargeType: 'detention_pickup',
      description: 'QA detention at pickup',
      quantity: 2,
      unitPriceCents: 5000,
      isBillable: true,
      isPayable: false,
    });

    const res = await asDispatcher.post(`/loads/${setup.loadId}/charges`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LoadChargeSchema.strict(), await res.json(), 'POST /loads/:id/charges');

    // Semantic — echoed fields + derived totalCents (quantity * unitPriceCents).
    expect(body.loadId).toBe(setup.id);
    expect(body.chargeType).toBe('detention_pickup');
    expect(body.description).toBe(payload.description);
    expect(body.quantity).toBe(2);
    expect(body.unitPriceCents).toBe(5000);
    expect(body.totalCents).toBe(10_000);
    expect(body.isBillable).toBe(true);
    expect(body.isPayable).toBe(false);

    // Persistence — GET lists the newly-created charge.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/charges`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadChargeSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/charges after POST',
    });
    expect(list.some((c) => c.id === body.id)).toBe(true);
  });

  // 2 ── GET /loads/:load_id/charges ─────────────────────────────────
  test('GET /loads/:load_id/charges returns the load charges in createdAt order @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    // Seed two charges so the ordering assertion has something to grab.
    const firstRes = await asDispatcher.post(
      `/loads/${setup.loadId}/charges`,
      buildLoadCharge({
        chargeType: 'lumper',
        description: 'QA lumper fee',
        unitPriceCents: 4500,
      }),
    );
    expect(firstRes.status()).toBe(201);
    const first = expectContract(LoadChargeSchema.strict(), await firstRes.json());

    const secondRes = await asDispatcher.post(
      `/loads/${setup.loadId}/charges`,
      buildLoadCharge({
        chargeType: 'fuel_surcharge',
        description: 'QA fuel surcharge',
        unitPriceCents: 8250,
      }),
    );
    expect(secondRes.status()).toBe(201);
    const second = expectContract(LoadChargeSchema.strict(), await secondRes.json());

    const res = await asDispatcher.get(`/loads/${setup.loadId}/charges`);
    expect(res.status()).toBe(200);
    const list = expectArrayContract(LoadChargeSchema.strict(), await res.json(), {
      context: 'GET /loads/:id/charges',
    });

    // Semantic — both seeded charges are present, scoped to this load, and
    // ordered by createdAt ascending per the service orderBy.
    expect(list.length).toBeGreaterThanOrEqual(2);
    const firstIdx = list.findIndex((c) => c.id === first.id);
    const secondIdx = list.findIndex((c) => c.id === second.id);
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    for (const charge of list) {
      expect(charge.loadId).toBe(setup.id);
    }
  });

  // 3 ── PATCH /loads/:load_id/charges/:charge_id ────────────────────
  test('PATCH /loads/:load_id/charges/:charge_id updates mutable fields and recomputes totalCents @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const seedRes = await asDispatcher.post(
      `/loads/${setup.loadId}/charges`,
      buildLoadCharge({
        chargeType: 'accessorial',
        description: 'QA accessorial',
        quantity: 1,
        unitPriceCents: 6000,
      }),
    );
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(LoadChargeSchema.strict(), await seedRes.json());
    expect(seed.totalCents).toBe(6000);

    const newDescription = 'QA accessorial (updated)';
    const newQuantity = 3;
    const newUnitPriceCents = 7_000;
    const newIsPayable = true;
    const patchRes = await asDispatcher.patch(`/loads/${setup.loadId}/charges/${seed.id}`, {
      description: newDescription,
      quantity: newQuantity,
      unitPriceCents: newUnitPriceCents,
      isPayable: newIsPayable,
    });
    expect(patchRes.status()).toBe(200);
    const updated = expectContract(LoadChargeSchema.strict(), await patchRes.json(), 'PATCH /loads/:id/charges/:cid');

    // Semantic — changed fields reflected, totalCents recomputed, id stable.
    expect(updated.id).toBe(seed.id);
    expect(updated.loadId).toBe(setup.id);
    expect(updated.description).toBe(newDescription);
    expect(updated.quantity).toBe(newQuantity);
    expect(updated.unitPriceCents).toBe(newUnitPriceCents);
    expect(updated.totalCents).toBe(newQuantity * newUnitPriceCents);
    expect(updated.isPayable).toBe(newIsPayable);
    // Unchanged — chargeType is not a patch field.
    expect(updated.chargeType).toBe('accessorial');

    // Persistence — GET reflects the new values.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/charges`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadChargeSchema.strict(), await listRes.json());
    const persisted = list.find((c) => c.id === seed.id);
    expect(persisted).toBeDefined();
    expect(persisted?.quantity).toBe(newQuantity);
    expect(persisted?.totalCents).toBe(newQuantity * newUnitPriceCents);
    expect(persisted?.isPayable).toBe(newIsPayable);
  });

  // 4 ── DELETE /loads/:load_id/charges/:charge_id ───────────────────
  test('DELETE /loads/:load_id/charges/:charge_id removes the charge from the load @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const seedRes = await asDispatcher.post(
      `/loads/${setup.loadId}/charges`,
      buildLoadCharge({
        chargeType: 'tonu',
        description: 'QA TONU',
        unitPriceCents: 15_000,
      }),
    );
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(LoadChargeSchema.strict(), await seedRes.json());

    const delRes = await asDispatcher.delete(`/loads/${setup.loadId}/charges/${seed.id}`);
    // DELETE returns the deleted Prisma row — shape matches LoadCharge after
    // serialization. Assert the status; body shape is not part of this test's
    // contract (no schema lock).
    expect(delRes.status()).toBe(200);

    // Persistence — the charge is absent from the subsequent list read, and
    // a second delete on the same id surfaces the controller's "not on this
    // load" 404 guard (line 882-884 of loads.controller.ts).
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/charges`);
    expect(listRes.status()).toBe(200);
    const listBody = (await listRes.json()) as Array<{ id: number }>;
    expect(Array.isArray(listBody)).toBe(true);
    expect(listBody.some((c) => c.id === seed.id)).toBe(false);

    const secondDelRes = await asDispatcher.delete(`/loads/${setup.loadId}/charges/${seed.id}`);
    expect(secondDelRes.status()).toBe(404);
  });
});

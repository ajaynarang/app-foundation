/**
 * Fleet — Loads (Core CRUD) API (Phase 1 Group 6 / 4)
 *
 * Covers the CRUD + read + duplicate + tracking-token + revert-preview +
 * revert endpoints on `LoadsController`:
 *
 *   - POST   /loads                           → create (PENDING by default)
 *   - GET    /loads                           → paginated list
 *   - GET    /loads/:load_id                  → detail
 *   - PATCH  /loads/:load_id                  → update mutable fields
 *   - DELETE /loads/:load_id                  → delete (DRAFT only)
 *   - POST   /loads/:load_id/duplicate        → duplicate (always DRAFT)
 *   - POST   /loads/:load_id/tracking-token   → issue tracking token
 *   - GET    /loads/:load_id/revert-preview   → dry-run revert impact
 *   - POST   /loads/:load_id/revert           → execute revert
 *
 * Role rules (from `@Roles` decorators):
 *   - All of the above → DISPATCHER, ADMIN, OWNER → `asDispatcher` suffices.
 *
 * State model (from `load-status-machine.ts`):
 *   DRAFT → PENDING (via status) → ASSIGNED (via assign) → IN_TRANSIT → DELIVERED.
 *   Reversals: IN_TRANSIT → ASSIGNED is the only `targetStatus` reachable
 *   without creating invoices/settlements first. That path is exercised
 *   here for the revert-preview + revert tests.
 *
 * Draft creation path (finding: the backend honours `status: 'DRAFT'` in
 * `CreateLoadDto`, so we can reach DRAFT directly via POST /loads
 * without jumping through the customer-portal request path. See
 * `LoadCreationService.create` — `status: (data.status as LoadStatus) ||
 * LoadStatus.PENDING`). This is the only non-PENDING status reachable via
 * the public create DTO.
 *
 * Schema strategy: hand-written in
 * `packages/test-utils/src/schemas/loads.ts` — `LoadSchema` in
 * shared-types drifts from `formatLoadResponse` (missing `vehicleId`,
 * missing flattened stop surface, activeLeg shape). See that file for
 * details.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLoad, buildDriver, buildVehicle } from '@sally/test-utils/factories';
import { cleanupLoad, createLoad, assignLoad, updateLoadStatus, revertLoad } from '@sally/test-utils/helpers';
import { expectContract, LoadSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

const {
  LoadResponseSchema,
  LoadListResponseSchema,
  DeleteLoadResponseSchema,
  TrackingTokenResponseSchema,
  RevertPreviewResponseSchema,
} = LoadSchemas;

// ── Helpers ─────────────────────────────────────────────────────────

/** First customer id on the tenant — every load must be customer-linked. */
async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — loads tests require a seeded customer');
  }
  return items[0].id;
}

test.describe('Fleet · Loads CRUD @workflow', () => {
  // Track loads created by tests for cleanup.
  const createdLoadIds: string[] = [];
  // Drivers/vehicles used to assign a load before reverting — deactivated
  // after the test. Separate arrays so a cleanup failure on one does not
  // cascade.
  const createdDriverIds: string[] = [];
  const createdVehicleIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    // Loads first — some may still be in PENDING/ASSIGNED after revert.
    // The cleanup helper swallows 404; DELETE only succeeds on DRAFT.
    // For non-DRAFT loads, we have to demote the load so cleanup can
    // finish. `updateLoadStatus(id, 'CANCELLED')` is accepted from most
    // non-terminal states — but CANCELLED loads still can't be deleted.
    // Since tests produce loads in various states, the contract we hold
    // is: cleanup is best-effort; the tenant-reset script between CI
    // runs is the hard reset.
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await asAdmin.post(`/drivers/${driverId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
    for (const vehicleId of createdVehicleIds.splice(0)) {
      await asAdmin.post(`/vehicles/${vehicleId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  // 1 ── POST /loads ───────────────────────────────────────────────
  test('POST /loads creates a load in PENDING with the payload fields @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const payload = buildLoad(customerId);

    const res = await asDispatcher.post('/loads', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LoadResponseSchema.strict(), await res.json(), 'POST /loads');
    createdLoadIds.push(body.loadId);

    // Semantic
    expect(body.status).toBe('PENDING');
    expect(body.customerId).toBe(customerId);
    expect(body.customerName).toBe(payload.customerName);
    expect(body.weightLbs).toBe(payload.weightLbs);
    expect(body.commodityType).toBe(payload.commodityType);
    expect(body.rateCents).toBe(payload.rateCents);
    expect(body.requiredEquipmentType).toBe(payload.requiredEquipmentType);
    expect(body.loadId).toMatch(/^LOAD-/);
    expect(body.loadNumber).toBeTruthy();
    expect(body.stops).toHaveLength(2);
    expect(body.stops.map((s) => s.actionType).sort()).toEqual(['delivery', 'pickup']);
    expect(body.isRelay).toBe(false);

    // Persistence
    const getRes = await asDispatcher.get(`/loads/${body.loadId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await getRes.json());
    expect(detail.loadId).toBe(body.loadId);
    expect(detail.status).toBe('PENDING');
  });

  // 2 ── GET /loads ────────────────────────────────────────────────
  test('GET /loads returns paginated envelope @workflow @destructive', async ({ asDispatcher }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    const res = await asDispatcher.get('/loads?limit=25&offset=0');
    expect(res.status()).toBe(200);
    const body = expectContract(LoadListResponseSchema.strict(), await res.json(), 'GET /loads');

    expect(body.limit).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.total).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);

    const seeded = body.data.find((l) => l.loadId === seed.loadId);
    expect(seeded).toBeDefined();
    expect(seeded?.status).toBe('PENDING');
    expect(seeded?.loadNumber).toBe(seed.loadNumber);
    expect(seeded?.stopCount).toBe(2);
  });

  // 3 ── GET /loads/:load_id ───────────────────────────────────────
  test('GET /loads/:load_id returns load detail @workflow @destructive', async ({ asDispatcher }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    const res = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await res.json(), 'GET /loads/:id');

    expect(detail.loadId).toBe(seed.loadId);
    expect(detail.status).toBe('PENDING');
    expect(detail.customerId).toBe(customerId);
    expect(detail.stops).toHaveLength(2);

    // Unknown id → 404.
    const missingRes = await asDispatcher.get('/loads/LOAD-does-not-exist');
    expect(missingRes.status()).toBe(404);
  });

  // 4 ── PATCH /loads/:load_id ─────────────────────────────────────
  test('PATCH /loads/:load_id updates mutable fields on a PENDING load @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    const newWeight = 48_500;
    const newCommodity = 'Electronics - Fragile';
    const newSpecial = 'Team drivers required';
    const res = await asDispatcher.patch(`/loads/${seed.loadId}`, {
      weightLbs: newWeight,
      commodityType: newCommodity,
      specialRequirements: newSpecial,
    });
    expect(res.status()).toBe(200);
    const updated = expectContract(LoadResponseSchema.strict(), await res.json(), 'PATCH /loads/:id');

    expect(updated.weightLbs).toBe(newWeight);
    expect(updated.commodityType).toBe(newCommodity);
    expect(updated.specialRequirements).toBe(newSpecial);
    expect(updated.loadId).toBe(seed.loadId);
    expect(updated.status).toBe('PENDING');

    // Persistence
    const detailRes = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await detailRes.json());
    expect(detail.weightLbs).toBe(newWeight);
    expect(detail.commodityType).toBe(newCommodity);
  });

  // 5 ── DELETE /loads/:load_id ────────────────────────────────────
  test('DELETE /loads/:load_id hard-deletes a DRAFT load @workflow @destructive', async ({ asDispatcher }) => {
    // Create directly into DRAFT — `LoadCreationService.create` honours the
    // optional `status` field on CreateLoadDto.
    const customerId = await firstCustomerId(asDispatcher);
    const draft = await createLoad(asDispatcher, customerId, { status: 'DRAFT' });
    expect(draft.status).toBe('DRAFT');
    // Terminal — do NOT push to createdLoadIds; this test IS the cleanup.

    const res = await asDispatcher.delete(`/loads/${draft.loadId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(DeleteLoadResponseSchema.strict(), await res.json(), 'DELETE /loads/:id');

    expect(body.deleted).toBe(true);
    expect(body.loadId).toBe(draft.loadId);

    // Persistence — detail returns 404 now that the row + stops + events
    // were wiped in a single transaction.
    const getRes = await asDispatcher.get(`/loads/${draft.loadId}`);
    expect(getRes.status()).toBe(404);
  });

  // 6 ── POST /loads/:load_id/duplicate ────────────────────────────
  test('POST /loads/:load_id/duplicate clones a load as a new DRAFT @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const original = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(original.loadId);

    const res = await asDispatcher.post(`/loads/${original.loadId}/duplicate`, {});
    expect(res.status()).toBe(201);
    const clone = expectContract(LoadResponseSchema.strict(), await res.json(), 'POST /loads/:id/duplicate');
    createdLoadIds.push(clone.loadId);

    // Semantic — clone has a new id, -COPY suffix on loadNumber, and is DRAFT.
    expect(clone.loadId).not.toBe(original.loadId);
    expect(clone.status).toBe('DRAFT');
    expect(clone.loadNumber).toBe(`${original.loadNumber}-COPY`);
    expect(clone.loadId).toBe(`LOAD-${original.loadNumber}-COPY`);
    expect(clone.customerId).toBe(customerId);
    expect(clone.stops).toHaveLength(2);
    expect(clone.driverId).toBeNull();
    expect(clone.vehicleId).toBeNull();

    // Persistence — both rows exist and are distinct.
    const originalRes = await asDispatcher.get(`/loads/${original.loadId}`);
    expect(originalRes.status()).toBe(200);
    const cloneRes = await asDispatcher.get(`/loads/${clone.loadId}`);
    expect(cloneRes.status()).toBe(200);
    const cloneDetail = expectContract(LoadResponseSchema.strict(), await cloneRes.json());
    expect(cloneDetail.status).toBe('DRAFT');
  });

  // 7 ── POST /loads/:load_id/tracking-token ───────────────────────
  test('POST /loads/:load_id/tracking-token issues a token bound to the load @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    const res = await asDispatcher.post(`/loads/${seed.loadId}/tracking-token`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(TrackingTokenResponseSchema, await res.json(), 'POST /loads/:id/tracking-token');

    // Semantic — token format is `<loadNumber>-<6 hex>` and the URL mirrors.
    expect(body.trackingToken.startsWith(`${seed.loadNumber}-`)).toBe(true);
    expect(body.trackingUrl).toBe(`/track/${body.trackingToken}`);

    // Persistence — the detail endpoint reflects the freshly-issued token.
    const detailRes = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await detailRes.json());
    expect(detail.trackingToken).toBe(body.trackingToken);
  });

  // 8 ── GET /loads/:load_id/revert-preview?targetStatus=ASSIGNED ──
  test('GET /loads/:load_id/revert-preview projects the IN_TRANSIT → ASSIGNED impact without mutating @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Set-up: fresh load + driver + vehicle, then advance to IN_TRANSIT.
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    const driverRes = await asAdmin.post('/drivers', buildDriver());
    expect(driverRes.status()).toBe(201);
    const driver = (await driverRes.json()) as { driverId: string };
    createdDriverIds.push(driver.driverId);

    const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
    expect(vehicleRes.status()).toBe(201);
    const vehicle = (await vehicleRes.json()) as { vehicleId: string };
    createdVehicleIds.push(vehicle.vehicleId);

    await assignLoad(asDispatcher, seed.loadId, driver.driverId, vehicle.vehicleId);
    await updateLoadStatus(asDispatcher, seed.loadId, 'IN_TRANSIT');

    const res = await asDispatcher.get(`/loads/${seed.loadId}/revert-preview?targetStatus=ASSIGNED`);
    expect(res.status()).toBe(200);
    const preview = expectContract(
      RevertPreviewResponseSchema.strict(),
      await res.json(),
      'GET /loads/:id/revert-preview',
    );

    // Semantic — preview is strictly a projection; no cascade has run yet.
    expect(preview.from).toBe('IN_TRANSIT');
    expect(preview.to).toBe('ASSIGNED');
    expect(preview.blocked).toBe(false);
    expect(preview.blockReason).toBeNull();
    expect(Array.isArray(preview.warnings)).toBe(true);

    // Persistence — the load is still IN_TRANSIT after the dry-run read.
    const detailRes = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await detailRes.json());
    expect(detail.status).toBe('IN_TRANSIT');

    // Missing targetStatus → 400 (controller guard).
    const badRes = await asDispatcher.get(`/loads/${seed.loadId}/revert-preview`);
    expect(badRes.status()).toBe(400);
  });

  // 9 ── POST /loads/:load_id/revert ───────────────────────────────
  test('POST /loads/:load_id/revert walks IN_TRANSIT back to ASSIGNED @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    const driverRes = await asAdmin.post('/drivers', buildDriver());
    expect(driverRes.status()).toBe(201);
    const driver = (await driverRes.json()) as { driverId: string };
    createdDriverIds.push(driver.driverId);

    const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
    expect(vehicleRes.status()).toBe(201);
    const vehicle = (await vehicleRes.json()) as { vehicleId: string };
    createdVehicleIds.push(vehicle.vehicleId);

    await assignLoad(asDispatcher, seed.loadId, driver.driverId, vehicle.vehicleId);
    await updateLoadStatus(asDispatcher, seed.loadId, 'IN_TRANSIT');

    // Execute the revert — uses the helper so the payload shape is
    // single-sourced (targetStatus + category + reason).
    await revertLoad(asDispatcher, seed.loadId, {
      targetStatus: 'ASSIGNED',
      category: 'dispatcher_correction',
      reason: 'QA revert test — walk the load back for reassignment',
    });

    // The controller returns `findOne` post-revert, but the helper does
    // not return a body. Re-read + assert the state machine landed.
    const detailRes = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await detailRes.json(), 'GET after revert');

    // Semantic — status demoted, inTransitAt cleared per `clearFields`
    // on the IN_TRANSIT→ASSIGNED reversal definition, assignment preserved.
    expect(detail.status).toBe('ASSIGNED');
    expect(detail.inTransitAt).toBeNull();
    expect(detail.assignedAt).not.toBeNull();
    expect(detail.driverId).not.toBeNull();
    expect(detail.vehicleId).not.toBeNull();

    // Reverting an ASSIGNED load to ASSIGNED has no reversal path → 400.
    const againRes = await asDispatcher.post(`/loads/${seed.loadId}/revert`, {
      targetStatus: 'ASSIGNED',
      category: 'dispatcher_correction',
      reason: 'QA revert test — second attempt should fail',
    });
    expect(againRes.status()).toBe(400);
  });
});

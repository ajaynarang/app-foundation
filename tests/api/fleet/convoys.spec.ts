/**
 * Fleet — Convoys API (Phase 1 Group 5)
 *
 * Covers all 8 endpoints on `ConvoyController`:
 *   - POST   /convoys                                → create from loads
 *   - GET    /convoys                                → paginated list
 *   - GET    /convoys/:convoy_id                     → detail
 *   - PATCH  /convoys/:convoy_id                     → reorder loads
 *   - POST   /convoys/:convoy_id/assign              → assign driver + vehicle
 *   - POST   /convoys/:convoy_id/loads               → add a load
 *   - DELETE /convoys/:convoy_id/loads/:load_id      → remove a load
 *   - POST   /convoys/:convoy_id/cancel              → cancel + release
 *
 * Role rules: every endpoint → DISPATCHER/ADMIN/OWNER → `asDispatcher`.
 * Driver / vehicle creation is ADMIN-only → `asAdmin` is taken for setup.
 *
 * State model (upper-case, per `ConvoyStatusSchema`):
 *   create without driver/vehicle → status: 'DRAFT'
 *   create with driver+vehicle    → status: 'ASSIGNED'
 *   assign (DRAFT | ASSIGNED)     → 'ASSIGNED'
 *   cancel                        → 'CANCELLED' (terminal) + loads released
 *
 * Lifecycle constraints enforced by `ConvoyService`:
 *   - 2-10 loads per convoy (DTO validation).
 *   - Member loads must be DRAFT or PENDING at create time; not relay;
 *     not already attached to another convoy.
 *   - `removeLoad` requires the convoy keep at least 2 loads — tests that
 *     need to remove a load seed the convoy with 3.
 *   - `cancel` rejects on a CANCELLED or COMPLETED convoy (validated by
 *     the status machine).
 *
 * Factory: `buildConvoy(loadIds, overrides)` — emits the exact
 * `CreateConvoyDto` shape (`loadIds`, optional `driverId`, optional
 * `vehicleId`, optional `generateRoute`).
 *
 * Helpers: `createConvoy` / `cancelConvoy` in
 * `@sally/test-utils/helpers/convoy-lifecycle.ts`.
 *
 * Each test builds a fresh customer + N fresh PENDING loads so state
 * assumptions are deterministic even under `--workers=2`. Loads are
 * created via `asDispatcher` (who owns `/loads`), drivers + vehicles for
 * the assign path are created via `asAdmin`. Cleanup cancels the convoy
 * (which releases its loads back to PENDING) and then drops every load
 * via `cleanupLoad`.
 *
 * Schema strategy — shared-types `ConvoyDetailSchema` /
 * `ConvoyListItemSchema` match the actual `ConvoyService.findOne` /
 * `findAll` output. Re-exported via `@sally/test-utils/schemas`
 * `ConvoySchemas`; see that file's header for the drift audit.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildConvoy, buildDriver, buildVehicle } from '@sally/test-utils/factories';
import { cancelConvoy, cleanupLoad, createConvoy, createLoad } from '@sally/test-utils/helpers';
import { expectContract, ConvoySchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

const { ConvoySchema, ConvoyListResponseSchema } = ConvoySchemas;

// ── Helpers ─────────────────────────────────────────────────────────

/** Find the first customer id on the tenant — needed by `createLoad`. */
async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — convoy tests require a seeded customer');
  }
  return items[0].id;
}

/**
 * Seed N PENDING loads owned by the first customer on the tenant. The
 * returned loads have their string `loadId` field — the canonical
 * reference used by `POST /convoys`. Caller is responsible for cleanup.
 */
async function seedPendingLoads(api: RoleApiClient, count: number): Promise<Array<{ loadId: string; id: number }>> {
  const customerId = await firstCustomerId(api);
  const loads: Array<{ loadId: string; id: number }> = [];
  for (let i = 0; i < count; i++) {
    const load = await createLoad(api, customerId);
    loads.push({ loadId: load.loadId, id: load.id });
  }
  return loads;
}

test.describe('Fleet · Convoys @workflow', () => {
  // Track convoys + loads that tests create so afterEach can clean them.
  // Tests mutate in-place; afterEach splices both arrays to zero.
  const createdConvoyStringIds: string[] = [];
  const createdLoadStringIds: string[] = [];
  // Drivers / vehicles created for the assign test — deactivated on
  // afterEach. Separate from convoy/load cleanup so one test's
  // destructive tearing-down doesn't cascade into another.
  const createdDriverStringIds: string[] = [];
  const createdVehicleStringIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    // 1. Cancel every convoy this test created. Cancel releases member
    //    loads back to PENDING (and unsets convoyId / convoyOrder). Safe
    //    for already-CANCELLED convoys — helper swallows 400 / 404.
    for (const convoyId of createdConvoyStringIds.splice(0)) {
      await cancelConvoy(asDispatcher, convoyId).catch(() => undefined);
    }
    // 2. Clean up every load this test touched. After cancel, loads are
    //    PENDING (no driver, no convoy) — safe to delete.
    for (const loadId of createdLoadStringIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    // 3. Deactivate drivers + vehicles used for the assign test.
    for (const driverId of createdDriverStringIds.splice(0)) {
      await asAdmin.post(`/drivers/${driverId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
    for (const vehicleId of createdVehicleStringIds.splice(0)) {
      await asAdmin.post(`/vehicles/${vehicleId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  // 1 ── POST /convoys ────────────────────────────────────────────
  test('POST /convoys creates a convoy from multiple loads @workflow @destructive', async ({ asDispatcher }) => {
    const loads = await seedPendingLoads(asDispatcher, 2);
    for (const l of loads) createdLoadStringIds.push(l.loadId);

    const payload = buildConvoy(loads.map((l) => l.loadId));
    const res = await asDispatcher.post('/convoys', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(ConvoySchema.strict(), await res.json(), 'POST /convoys');

    createdConvoyStringIds.push(body.convoyId);

    // Semantic
    expect(body.status).toBe('DRAFT');
    expect(body.loadCount).toBe(2);
    expect(body.convoyId).toMatch(/^CNV-/);
    expect(body.assignedAt).toBeNull();
    expect(body.cancelledAt).toBeNull();
    expect(body.driverId).toBeNull();
    expect(body.vehicleId).toBeNull();
    // loadIds round-trip: the detail response's `loads[].loadId` set
    // must equal the payload's `loadIds` set (convoyOrder is the only
    // difference, pickupDate ordering preserved).
    const returnedLoadIds = body.loads.map((l) => l.loadId).sort();
    expect(returnedLoadIds).toEqual([...payload.loadIds].sort());
    for (const l of body.loads) {
      expect(l.convoyOrder).toBeGreaterThanOrEqual(1);
      expect(l.convoyOrder).toBeLessThanOrEqual(2);
    }

    // Persistence: GET detail matches.
    const detailRes = await asDispatcher.get(`/convoys/${body.convoyId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(ConvoySchema.strict(), await detailRes.json());
    expect(detail.convoyId).toBe(body.convoyId);
    expect(detail.loadCount).toBe(2);
  });

  // 2 ── GET /convoys ─────────────────────────────────────────────
  test('GET /convoys returns paginated envelope @workflow @destructive', async ({ asDispatcher }) => {
    const loads = await seedPendingLoads(asDispatcher, 2);
    for (const l of loads) createdLoadStringIds.push(l.loadId);

    const convoy = await createConvoy(
      asDispatcher,
      loads.map((l) => l.loadId),
    );
    createdConvoyStringIds.push(convoy.convoyId);

    const res = await asDispatcher.get('/convoys?limit=25&offset=0&sortBy=createdAt&sortOrder=desc');
    expect(res.status()).toBe(200);
    const body = expectContract(ConvoyListResponseSchema.strict(), await res.json(), 'GET /convoys');

    expect(body.limit).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.total).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);

    const seeded = body.data.find((c) => c.convoyId === convoy.convoyId);
    expect(seeded).toBeDefined();
    expect(seeded?.status).toBe('DRAFT');
    expect(seeded?.loadCount).toBe(2);
  });

  // 3 ── GET /convoys/:convoy_id ──────────────────────────────────
  test('GET /convoys/:convoy_id returns convoy detail with loads @workflow @destructive', async ({ asDispatcher }) => {
    const loads = await seedPendingLoads(asDispatcher, 2);
    for (const l of loads) createdLoadStringIds.push(l.loadId);

    const convoy = await createConvoy(
      asDispatcher,
      loads.map((l) => l.loadId),
    );
    createdConvoyStringIds.push(convoy.convoyId);

    const res = await asDispatcher.get(`/convoys/${convoy.convoyId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(ConvoySchema.strict(), await res.json(), 'GET /convoys/:id');

    // Semantic
    expect(detail.convoyId).toBe(convoy.convoyId);
    expect(detail.loadCount).toBe(2);
    expect(detail.loads).toHaveLength(2);
    // Loads ordered by convoyOrder ASC (service uses this orderBy).
    const orders = detail.loads.map((l) => l.convoyOrder);
    expect(orders).toEqual([1, 2]);
    for (const l of detail.loads) {
      expect(l.loadId).toMatch(/^LOAD-/);
      expect(['DRAFT', 'PENDING']).toContain(l.status);
    }

    // Unknown id → 404.
    const missingRes = await asDispatcher.get('/convoys/CNV-does-not-exist');
    expect(missingRes.status()).toBe(404);
  });

  // 4 ── PATCH /convoys/:convoy_id ────────────────────────────────
  test('PATCH /convoys/:convoy_id reorders loads within the convoy @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const loads = await seedPendingLoads(asDispatcher, 2);
    for (const l of loads) createdLoadStringIds.push(l.loadId);

    const convoy = await createConvoy(
      asDispatcher,
      loads.map((l) => l.loadId),
    );
    createdConvoyStringIds.push(convoy.convoyId);

    // Read back to learn the service-assigned convoyOrder (loads were
    // ordered by pickupDate ASC at create time).
    const initialRes = await asDispatcher.get(`/convoys/${convoy.convoyId}`);
    expect(initialRes.status()).toBe(200);
    const initial = expectContract(ConvoySchema.strict(), await initialRes.json());
    const originalFirst = initial.loads.find((l) => l.convoyOrder === 1);
    const originalSecond = initial.loads.find((l) => l.convoyOrder === 2);
    expect(originalFirst).toBeDefined();
    expect(originalSecond).toBeDefined();

    // Swap them.
    const res = await asDispatcher.patch(`/convoys/${convoy.convoyId}`, {
      loadOrder: [
        { loadId: originalFirst!.loadId, convoyOrder: 2 },
        { loadId: originalSecond!.loadId, convoyOrder: 1 },
      ],
    });
    expect(res.status()).toBe(200);
    const updated = expectContract(ConvoySchema.strict(), await res.json(), 'PATCH /convoys/:id');

    // Semantic: order swapped.
    const newFirst = updated.loads.find((l) => l.convoyOrder === 1);
    const newSecond = updated.loads.find((l) => l.convoyOrder === 2);
    expect(newFirst?.loadId).toBe(originalSecond!.loadId);
    expect(newSecond?.loadId).toBe(originalFirst!.loadId);

    // Persistence
    const detailRes = await asDispatcher.get(`/convoys/${convoy.convoyId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(ConvoySchema.strict(), await detailRes.json());
    expect(detail.loads.find((l) => l.convoyOrder === 1)?.loadId).toBe(originalSecond!.loadId);
  });

  // 5 ── POST /convoys/:convoy_id/assign ──────────────────────────
  test('POST /convoys/:convoy_id/assign sets driver + vehicle and transitions to ASSIGNED @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Set up: fresh ACTIVE driver + AVAILABLE vehicle owned by asAdmin
    // (creation is ADMIN-only per role decorators).
    // `POST /drivers` returns the controller's public shape which omits
    // `status`; the service hardcodes status=ACTIVE on create (see
    // findings.md #1). Verify ACTIVE via the detail endpoint so convoy
    // assign — which requires an ACTIVE driver — has a known invariant.
    const driverRes = await asAdmin.post('/drivers', buildDriver());
    expect(driverRes.status()).toBe(201);
    const driver = (await driverRes.json()) as { driverId: string };
    createdDriverStringIds.push(driver.driverId);
    const driverDetailRes = await asAdmin.get(`/drivers/${driver.driverId}`);
    expect(driverDetailRes.status()).toBe(200);
    const driverDetail = (await driverDetailRes.json()) as { status: string };
    expect(driverDetail.status).toBe('ACTIVE');

    const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
    expect(vehicleRes.status()).toBe(201);
    const vehicle = (await vehicleRes.json()) as { vehicleId: string };
    createdVehicleStringIds.push(vehicle.vehicleId);

    // Two fresh loads + DRAFT convoy.
    const loads = await seedPendingLoads(asDispatcher, 2);
    for (const l of loads) createdLoadStringIds.push(l.loadId);

    const convoy = await createConvoy(
      asDispatcher,
      loads.map((l) => l.loadId),
    );
    createdConvoyStringIds.push(convoy.convoyId);
    expect(convoy.status).toBe('DRAFT');

    const res = await asDispatcher.post(`/convoys/${convoy.convoyId}/assign`, {
      driverId: driver.driverId,
      vehicleId: vehicle.vehicleId,
    });
    expect(res.status()).toBe(201);
    const assigned = expectContract(ConvoySchema.strict(), await res.json(), 'POST /convoys/:id/assign');

    // Semantic
    expect(assigned.status).toBe('ASSIGNED');
    expect(assigned.driverStringId).toBe(driver.driverId);
    expect(assigned.vehicleUnitNumber).not.toBeNull();
    expect(assigned.assignedAt).not.toBeNull();
    // Loads got synced: each is ASSIGNED via the convoy.
    for (const l of assigned.loads) {
      expect(l.status).toBe('ASSIGNED');
    }

    // Persistence
    const detailRes = await asDispatcher.get(`/convoys/${convoy.convoyId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(ConvoySchema.strict(), await detailRes.json());
    expect(detail.status).toBe('ASSIGNED');
    expect(detail.driverStringId).toBe(driver.driverId);
  });

  // 6 ── POST /convoys/:convoy_id/loads ───────────────────────────
  test('POST /convoys/:convoy_id/loads adds a load to an existing convoy @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Seed a 2-load DRAFT convoy + a third standalone load to add.
    const seed = await seedPendingLoads(asDispatcher, 2);
    for (const l of seed) createdLoadStringIds.push(l.loadId);
    const extra = await seedPendingLoads(asDispatcher, 1);
    for (const l of extra) createdLoadStringIds.push(l.loadId);

    const convoy = await createConvoy(
      asDispatcher,
      seed.map((l) => l.loadId),
    );
    createdConvoyStringIds.push(convoy.convoyId);
    expect(convoy.loadCount).toBe(2);

    const res = await asDispatcher.post(`/convoys/${convoy.convoyId}/loads`, { loadId: extra[0].loadId });
    expect(res.status()).toBe(201);
    const withThird = expectContract(ConvoySchema.strict(), await res.json(), 'POST /convoys/:id/loads');

    // Semantic
    expect(withThird.loadCount).toBe(3);
    expect(withThird.loads).toHaveLength(3);
    const added = withThird.loads.find((l) => l.loadId === extra[0].loadId);
    expect(added).toBeDefined();
    expect(added?.convoyOrder).toBe(3);

    // Persistence
    const detailRes = await asDispatcher.get(`/convoys/${convoy.convoyId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(ConvoySchema.strict(), await detailRes.json());
    expect(detail.loadCount).toBe(3);
    expect(detail.loads.some((l) => l.loadId === extra[0].loadId)).toBe(true);
  });

  // 7 ── DELETE /convoys/:convoy_id/loads/:load_id ────────────────
  test('DELETE /convoys/:convoy_id/loads/:load_id removes a load from a convoy @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Seed 3 loads so removal still leaves the minimum-2 member count.
    const loads = await seedPendingLoads(asDispatcher, 3);
    for (const l of loads) createdLoadStringIds.push(l.loadId);

    const convoy = await createConvoy(
      asDispatcher,
      loads.map((l) => l.loadId),
    );
    createdConvoyStringIds.push(convoy.convoyId);
    expect(convoy.loadCount).toBe(3);

    // Remove the middle load to confirm ordering is compacted.
    const toRemove = loads[1].loadId;
    const res = await asDispatcher.delete(`/convoys/${convoy.convoyId}/loads/${toRemove}`);
    expect(res.status()).toBe(200);
    const remaining = expectContract(ConvoySchema.strict(), await res.json(), 'DELETE /convoys/:id/loads/:loadId');

    // Semantic: load count drops, removed load is gone, surviving loads
    // are re-numbered 1..N-1 with no gaps.
    expect(remaining.loadCount).toBe(2);
    expect(remaining.loads).toHaveLength(2);
    expect(remaining.loads.some((l) => l.loadId === toRemove)).toBe(false);
    const survivingOrders = remaining.loads.map((l) => l.convoyOrder).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(survivingOrders).toEqual([1, 2]);

    // Persistence
    const detailRes = await asDispatcher.get(`/convoys/${convoy.convoyId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(ConvoySchema.strict(), await detailRes.json());
    expect(detail.loadCount).toBe(2);
    expect(detail.loads.some((l) => l.loadId === toRemove)).toBe(false);
  });

  // 8 ── POST /convoys/:convoy_id/cancel ──────────────────────────
  test('POST /convoys/:convoy_id/cancel marks convoy CANCELLED and releases loads @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const loads = await seedPendingLoads(asDispatcher, 2);
    for (const l of loads) createdLoadStringIds.push(l.loadId);

    const convoy = await createConvoy(
      asDispatcher,
      loads.map((l) => l.loadId),
    );
    // Terminal — push so afterEach's cancelConvoy is a no-op (helper
    // swallows the 400 "already cancelled" return).
    createdConvoyStringIds.push(convoy.convoyId);

    const res = await asDispatcher.post(`/convoys/${convoy.convoyId}/cancel`);
    expect(res.status()).toBe(201);
    const cancelled = expectContract(ConvoySchema.strict(), await res.json(), 'POST /convoys/:id/cancel');

    // Semantic
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).not.toBeNull();
    // cancel is terminal — detail still shows the convoy with its loads
    // but those loads' `convoyId` on the Load row is now null. The
    // convoy detail however still returns its historical loads via the
    // Prisma `loads` relation (which is backed by Load.convoyId FK) —
    // so post-cancel, the convoy's loads array is EMPTY. Confirm.
    expect(cancelled.loads).toHaveLength(0);

    // Persistence: each load went back to PENDING, no driver, no convoy.
    for (const seed of loads) {
      const loadRes = await asDispatcher.get(`/loads/${seed.loadId}`);
      expect(loadRes.status()).toBe(200);
      const load = (await loadRes.json()) as {
        status: string;
        convoyId: number | null;
      };
      expect(load.status).toBe('PENDING');
      expect(load.convoyId).toBeNull();
    }

    // Cancelling again must reject — the status machine guards CANCELLED.
    const secondRes = await asDispatcher.post(`/convoys/${convoy.convoyId}/cancel`);
    expect(secondRes.status()).toBe(400);
  });
});

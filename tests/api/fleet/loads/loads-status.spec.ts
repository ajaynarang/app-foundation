/**
 * Fleet — Loads Status API (Phase 1 Group 6)
 *
 * Covers the status-driving endpoints on `LoadsController`:
 *
 *   - PATCH /loads/:load_id/status               → drive status state machine
 *   - POST  /loads/:load_id/revert-delivery      → [Deprecated] revert DELIVERED
 *
 * Role rules: DISPATCHER, ADMIN, OWNER → `asDispatcher` suffices for both.
 *
 * Deprecation note: `/revert-delivery` is annotated `@Deprecated` in the
 * controller and will be removed once the unified `/revert` path is fully
 * rolled out. We still cover it here because (a) it is wired in
 * production today and (b) the rule in effect is "no snapshot of broken
 * behavior" — the endpoint is valid, just deprecated. We tag
 * `@destructive` and verify it actually reverts, then use the unified
 * `/revert` as the primary replacement in `loads-crud.spec.ts`.
 *
 * State machine traversal for the delivery revert test:
 *   create → assign → updateStatus IN_TRANSIT → updateStatus DELIVERED
 *   → revert-delivery → IN_TRANSIT (no deliveredAt, no billingStatus).
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDriver, buildVehicle } from '@sally/test-utils/factories';
import { assignLoad, cleanupLoad, createLoad, updateLoadStatus } from '@sally/test-utils/helpers';
import { expectContract, LoadSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

const { LoadResponseSchema } = LoadSchemas;

// ── Helpers ─────────────────────────────────────────────────────────

async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — loads-status tests require a seeded customer');
  }
  return items[0].id;
}

test.describe('Fleet · Loads Status @workflow', () => {
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];
  const createdVehicleIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
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

  // 1 ── PATCH /loads/:load_id/status ───────────────────────────────
  test('PATCH /loads/:load_id/status advances PENDING → ASSIGNED → IN_TRANSIT → DELIVERED @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);
    expect(seed.status).toBe('PENDING');

    // The PENDING → ASSIGNED transition happens via the assign endpoint
    // (the status-update endpoint does not accept ASSIGNED without an
    // assignment — the load-creation path is the only source of a
    // driverless ASSIGNED). Go via the assign endpoint.
    const driverRes = await asAdmin.post('/drivers', buildDriver());
    expect(driverRes.status()).toBe(201);
    const driver = (await driverRes.json()) as { driverId: string };
    createdDriverIds.push(driver.driverId);

    const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
    expect(vehicleRes.status()).toBe(201);
    const vehicle = (await vehicleRes.json()) as { vehicleId: string };
    createdVehicleIds.push(vehicle.vehicleId);

    await assignLoad(asDispatcher, seed.loadId, driver.driverId, vehicle.vehicleId);

    // Now exercise the status endpoint directly for the remaining hops.
    const inTransitRes = await asDispatcher.patch(`/loads/${seed.loadId}/status`, { status: 'IN_TRANSIT' });
    expect(inTransitRes.status()).toBe(200);
    const inTransit = expectContract(
      LoadResponseSchema.strict(),
      await inTransitRes.json(),
      'PATCH /loads/:id/status → IN_TRANSIT',
    );
    expect(inTransit.status).toBe('IN_TRANSIT');
    expect(inTransit.inTransitAt).not.toBeNull();
    expect(inTransit.assignedAt).not.toBeNull();

    const deliveredRes = await asDispatcher.patch(`/loads/${seed.loadId}/status`, { status: 'DELIVERED' });
    expect(deliveredRes.status()).toBe(200);
    const delivered = expectContract(
      LoadResponseSchema.strict(),
      await deliveredRes.json(),
      'PATCH /loads/:id/status → DELIVERED',
    );
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.billingStatus).toBe('PENDING_DOCUMENTS');
    // All stops flipped to `completed` as part of the delivery transition.
    for (const stop of delivered.stops) {
      expect(stop.status).toBe('completed');
      expect(stop.completedAt).not.toBeNull();
    }

    // Persistence — detail still reflects DELIVERED.
    const detailRes = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await detailRes.json());
    expect(detail.status).toBe('DELIVERED');

    // Invalid transition (DELIVERED → PENDING is not in the state machine
    // nor a reversal definition) → 400.
    const invalidRes = await asDispatcher.patch(`/loads/${seed.loadId}/status`, { status: 'PENDING' });
    expect(invalidRes.status()).toBe(400);
  });

  // 2 ── POST /loads/:load_id/revert-delivery  [Deprecated] ─────────
  test('POST /loads/:load_id/revert-delivery reverts DELIVERED → IN_TRANSIT (legacy path) @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Walk the load all the way to DELIVERED via the forward path.
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
    await updateLoadStatus(asDispatcher, seed.loadId, 'DELIVERED');

    // Exercise the deprecated endpoint. Body shape: `{ reason }` (>= 5 chars).
    const res = await asDispatcher.post(`/loads/${seed.loadId}/revert-delivery`, {
      reason: 'QA deprecated-path coverage — revert to IN_TRANSIT',
    });
    expect(res.status()).toBe(201);
    const reverted = expectContract(LoadResponseSchema.strict(), await res.json(), 'POST /loads/:id/revert-delivery');

    // Semantic — status demoted, deliveredAt + billingStatus cleared per
    // the unified reversal definition for DELIVERED→IN_TRANSIT.
    expect(reverted.status).toBe('IN_TRANSIT');
    expect(reverted.deliveredAt).toBeNull();
    expect(reverted.billingStatus).toBeNull();

    // Persistence
    const detailRes = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await detailRes.json());
    expect(detail.status).toBe('IN_TRANSIT');

    // The deprecated endpoint should reject a second revert — reversal
    // config has no IN_TRANSIT→IN_TRANSIT path.
    const secondRes = await asDispatcher.post(`/loads/${seed.loadId}/revert-delivery`, {
      reason: 'QA deprecated-path coverage — second attempt must fail',
    });
    expect(secondRes.status()).toBe(400);
  });
});

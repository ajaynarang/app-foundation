/**
 * Fleet — Loads Assignment API (Phase 1 Group 6)
 *
 * Covers one endpoint on `LoadsController`:
 *
 *   - POST /loads/:load_id/assign   → assign driver + vehicle to a load
 *
 * Body shape: `{ driverId, vehicleId?, trailerId? }`. Both `driverId` and
 * `vehicleId` are the STRING public identifiers (e.g. "DRV-abc" / "VEH-xyz")
 * — the service resolves them to numeric DB ids internally.
 *
 * Role rule: DISPATCHER, ADMIN, OWNER → `asDispatcher`. Driver + vehicle
 * creation is ADMIN-only so we still take `asAdmin` for setup.
 *
 * State model:
 *   PENDING + ACTIVE driver + AVAILABLE vehicle
 *     → ASSIGNED (load.status = ASSIGNED, vehicle.status flips to
 *       ASSIGNED, driver.currentLoadId = load.id, assignedAt set).
 *
 * Finding #1 (see findings.md) — `POST /drivers` returns an ACTIVE driver
 * directly (no PENDING → ACTIVE hop needed via the public API). So this
 * test skips the activate step and uses the fresh driver straight from
 * the create response.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDriver, buildVehicle } from '@sally/test-utils/factories';
import { cleanupLoad, createLoad } from '@sally/test-utils/helpers';
import { expectContract, LoadSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

const { LoadResponseSchema, AssignLoadResponseSchema } = LoadSchemas;

// ── Helpers ─────────────────────────────────────────────────────────

async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — loads-assignment tests require a seeded customer');
  }
  return items[0].id;
}

test.describe('Fleet · Loads Assignment @workflow', () => {
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

  // 1 ── POST /loads/:load_id/assign ────────────────────────────────
  test('POST /loads/:load_id/assign sets driver + vehicle and transitions PENDING → ASSIGNED @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);
    expect(seed.status).toBe('PENDING');

    // Fresh driver + vehicle — both available for the assign op.
    const driverRes = await asAdmin.post('/drivers', buildDriver());
    expect(driverRes.status()).toBe(201);
    const driver = (await driverRes.json()) as { driverId: string };
    createdDriverIds.push(driver.driverId);

    const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
    expect(vehicleRes.status()).toBe(201);
    const vehicle = (await vehicleRes.json()) as { vehicleId: string };
    createdVehicleIds.push(vehicle.vehicleId);

    const res = await asDispatcher.post(`/loads/${seed.loadId}/assign`, {
      driverId: driver.driverId,
      vehicleId: vehicle.vehicleId,
    });
    expect(res.status()).toBe(201);
    const assigned = expectContract(AssignLoadResponseSchema.strict(), await res.json(), 'POST /loads/:id/assign');

    // Semantic — response carries the mutation echo (not a formatLoadResponse).
    expect(assigned.success).toBe(true);
    expect(assigned.loadId).toBe(seed.loadId);
    expect(assigned.driverId).toBe(driver.driverId);
    expect(assigned.vehicleId).toBe(vehicle.vehicleId);
    expect(assigned.status).toBe('ASSIGNED');
    expect(assigned.driverName).toBeTruthy();
    expect(assigned.vehicleUnitNumber).toBeTruthy();

    // Persistence — the detail endpoint (formatLoadResponse shape) reflects
    // the assignment: load transitioned to ASSIGNED, FK + denorm fields set.
    const detailRes = await asDispatcher.get(`/loads/${seed.loadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(LoadResponseSchema.strict(), await detailRes.json());
    expect(detail.status).toBe('ASSIGNED');
    expect(detail.assignedAt).not.toBeNull();
    expect(detail.driverId).not.toBeNull();
    expect(detail.driverName).toBe(assigned.driverName);
    expect(detail.vehicleId).not.toBeNull();
    expect(detail.vehicleNumber).toBe(assigned.vehicleUnitNumber);

    // Assigning a non-existent driver must 404 (not 500).
    const ghostRes = await asDispatcher.post(`/loads/${seed.loadId}/assign`, {
      driverId: 'DRV-does-not-exist',
      vehicleId: vehicle.vehicleId,
    });
    expect(ghostRes.status()).toBe(404);
  });
});

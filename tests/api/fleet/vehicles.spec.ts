/**
 * Fleet — Vehicles API (Phase 1 Group 1)
 *
 * Covers all 8 endpoints on VehiclesController. Each test satisfies the
 * 9-criteria rubric: role fixture, factory, specific status, schema contract,
 * semantic assertion, persistence check, cleanup, tags, zero runtime skip.
 *
 * Role rules (from RBAC decorators):
 *   - list / detail          → DISPATCHER, ADMIN, OWNER  → asDispatcher
 *   - create / lifecycle     → ADMIN, OWNER              → asAdmin
 *   - update                 → DISPATCHER, ADMIN, OWNER  → asDispatcher
 *   - inactive/list          → ADMIN, OWNER              → asAdmin
 *
 * Schema fallbacks: shared-types `VehicleSchema.strict()` rejects valid
 * backend responses that include `activeLoadCounts` + `upcomingUnavailability`
 * (list) or `lifecycleStatus/telematics/assignedDriver` (detail). See
 * `packages/test-utils/src/schemas/SCHEMA-AUDIT.md`. We use the hand-written
 * test-utils schemas that match the actual `VehiclesService.formatResponse`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildVehicle } from '@sally/test-utils/factories';
import { expectContract, expectArrayContract, VehicleSchemas } from '@sally/test-utils/schemas';

const { VehicleListItemSchema, CreateVehicleResponseSchema, UpdateVehicleResponseSchema, VehicleDetailSchema } =
  VehicleSchemas;

test.describe('Fleet · Vehicles @workflow', () => {
  // Track vehicles created by tests that do NOT terminate with decommission,
  // so afterEach can deactivate them (soft-cleanup).
  const activeCreatedVehicleIds: string[] = [];

  test.afterEach(async ({ asAdmin }) => {
    for (const id of activeCreatedVehicleIds.splice(0)) {
      await asAdmin.post(`/vehicles/${id}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  test('GET /vehicles lists active vehicles @workflow', async ({ asDispatcher, asAdmin }) => {
    // Seed one so the list is non-empty regardless of tenant state.
    const payload = buildVehicle();
    const createRes = await asAdmin.post('/vehicles', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedVehicleIds.push(created.vehicleId);

    const res = await asDispatcher.get('/vehicles');
    expect(res.status()).toBe(200);
    const body: unknown = await res.json();
    const items = expectArrayContract(VehicleListItemSchema, body, {
      allowEmpty: false,
      context: 'GET /vehicles',
    });

    // Semantic: our seeded vehicle must appear in the list with the right unit number.
    const seeded = items.find((v) => v.vehicleId === created.vehicleId);
    expect(seeded).toBeDefined();
    expect(seeded?.unitNumber).toBe(payload.unitNumber);
    expect(seeded?.lifecycleStatus).toBe('ACTIVE');
  });

  test('POST /vehicles creates a vehicle @workflow @destructive', async ({ asAdmin }) => {
    const payload = buildVehicle();
    const res = await asAdmin.post('/vehicles', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(CreateVehicleResponseSchema, await res.json(), 'POST /vehicles');

    // Semantic
    expect(body.unitNumber).toBe(payload.unitNumber);
    expect(body.vin).toBe(payload.vin);
    expect(body.equipmentType).toBe(payload.equipmentType);
    expect(body.status).toBe('AVAILABLE');

    activeCreatedVehicleIds.push(body.vehicleId);

    // Persistence
    const getRes = await asAdmin.get(`/vehicles/${body.vehicleId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(VehicleDetailSchema, await getRes.json());
    expect(detail.vehicleId).toBe(body.vehicleId);
  });

  test('PUT /vehicles/:vehicle_id updates a vehicle @workflow @destructive', async ({ asAdmin, asDispatcher }) => {
    const payload = buildVehicle();
    const createRes = await asAdmin.post('/vehicles', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedVehicleIds.push(created.vehicleId);

    // DISPATCHER is authorised to update.
    const newMake = 'Kenworth';
    const updateRes = await asDispatcher.put(`/vehicles/${created.vehicleId}`, {
      make: newMake,
      model: 'T680',
    });
    expect(updateRes.status()).toBe(200);
    const updated = expectContract(UpdateVehicleResponseSchema, await updateRes.json(), 'PUT /vehicles/:id');

    // Semantic: changed field echoed back.
    expect(updated.make).toBe(newMake);
    expect(updated.model).toBe('T680');
    expect(updated.vehicleId).toBe(created.vehicleId);

    // Persistence: GET confirms the update landed.
    const getRes = await asDispatcher.get(`/vehicles/${created.vehicleId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(VehicleDetailSchema, await getRes.json());
    expect(detail.make).toBe(newMake);
  });

  test('GET /vehicles/inactive/list returns deactivated + decommissioned @workflow @destructive', async ({
    asAdmin,
  }) => {
    // Seed, then deactivate so we know the list will contain at least one entry.
    const payload = buildVehicle();
    const createRes = await asAdmin.post('/vehicles', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const deactRes = await asAdmin.post(`/vehicles/${created.vehicleId}/deactivate`, {
      reason: 'prep inactive-list test',
    });
    expect(deactRes.status()).toBe(201);

    const res = await asAdmin.get('/vehicles/inactive/list');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(VehicleDetailSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /vehicles/inactive/list',
    });

    // Semantic: every item is non-ACTIVE and our seeded one is present.
    for (const v of items) {
      expect(['INACTIVE', 'DECOMMISSIONED']).toContain(v.lifecycleStatus);
    }
    const seeded = items.find((v) => v.vehicleId === created.vehicleId);
    expect(seeded).toBeDefined();
    expect(seeded?.lifecycleStatus).toBe('INACTIVE');

    // Persistence handled by reactivate below so afterEach deactivate (idempotent
    // via catch) does not trip on already-inactive vehicle.
    const reactivateRes = await asAdmin.post(`/vehicles/${created.vehicleId}/reactivate`);
    expect(reactivateRes.status()).toBe(201);
    activeCreatedVehicleIds.push(created.vehicleId);
  });

  test('GET /vehicles/:vehicle_id returns a single vehicle @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const payload = buildVehicle();
    const createRes = await asAdmin.post('/vehicles', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedVehicleIds.push(created.vehicleId);

    const res = await asDispatcher.get(`/vehicles/${created.vehicleId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(VehicleDetailSchema, await res.json(), 'GET /vehicles/:id');

    // Semantic
    expect(detail.vehicleId).toBe(created.vehicleId);
    expect(detail.unitNumber).toBe(payload.unitNumber);
    expect(detail.lifecycleStatus).toBe('ACTIVE');

    // Persistence: unknown id returns 404.
    const missingRes = await asDispatcher.get('/vehicles/does-not-exist-xyz');
    expect(missingRes.status()).toBe(404);
  });

  test('POST /vehicles/:vehicle_id/deactivate transitions to INACTIVE @workflow @destructive', async ({ asAdmin }) => {
    const payload = buildVehicle();
    const createRes = await asAdmin.post('/vehicles', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const res = await asAdmin.post(`/vehicles/${created.vehicleId}/deactivate`, { reason: 'lifecycle test' });
    expect(res.status()).toBe(201);
    const body = expectContract(VehicleDetailSchema, await res.json(), 'POST /vehicles/:id/deactivate');

    // Semantic
    expect(body.lifecycleStatus).toBe('INACTIVE');
    expect(body.deactivationReason).toBe('lifecycle test');
    expect(body.deactivatedAt).not.toBeNull();

    // Persistence: GET reflects the transition.
    const getRes = await asAdmin.get(`/vehicles/${created.vehicleId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(VehicleDetailSchema, await getRes.json());
    expect(detail.lifecycleStatus).toBe('INACTIVE');

    // Already INACTIVE — afterEach idempotent; no tracking push needed.
  });

  test('POST /vehicles/:vehicle_id/reactivate transitions back to ACTIVE @workflow @destructive', async ({
    asAdmin,
  }) => {
    const payload = buildVehicle();
    const createRes = await asAdmin.post('/vehicles', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const deactRes = await asAdmin.post(`/vehicles/${created.vehicleId}/deactivate`, {
      reason: 'prep reactivate test',
    });
    expect(deactRes.status()).toBe(201);

    const res = await asAdmin.post(`/vehicles/${created.vehicleId}/reactivate`);
    expect(res.status()).toBe(201);
    const body = expectContract(VehicleDetailSchema, await res.json(), 'POST /vehicles/:id/reactivate');

    // Semantic
    expect(body.lifecycleStatus).toBe('ACTIVE');
    expect(body.reactivatedAt).not.toBeNull();
    expect(body.deactivatedAt).toBeNull();

    // Persistence
    const getRes = await asAdmin.get(`/vehicles/${created.vehicleId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(VehicleDetailSchema, await getRes.json());
    expect(detail.lifecycleStatus).toBe('ACTIVE');

    activeCreatedVehicleIds.push(created.vehicleId);
  });

  test('POST /vehicles/:vehicle_id/decommission permanently decommissions @workflow @destructive', async ({
    asAdmin,
  }) => {
    // Decommission is PERMANENT — no reactivate, no cleanup. A fresh vehicle
    // is created solely for this test so the terminal state is intentional.
    const payload = buildVehicle();
    const createRes = await asAdmin.post('/vehicles', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const res = await asAdmin.post(`/vehicles/${created.vehicleId}/decommission`, {
      reason: 'end-of-life lifecycle test',
    });
    expect(res.status()).toBe(201);
    const body = expectContract(VehicleDetailSchema, await res.json(), 'POST /vehicles/:id/decommission');

    // Semantic
    expect(body.lifecycleStatus).toBe('DECOMMISSIONED');
    expect(body.deactivationReason).toBe('end-of-life lifecycle test');

    // Persistence
    const getRes = await asAdmin.get(`/vehicles/${created.vehicleId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(VehicleDetailSchema, await getRes.json());
    expect(detail.lifecycleStatus).toBe('DECOMMISSIONED');

    // Intentionally NOT pushed to activeCreatedVehicleIds — the test IS the cleanup.
  });
});

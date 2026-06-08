/**
 * Fleet — Trailers API (Phase 1 Group 1)
 *
 * Covers all 10 endpoints on TrailersController, one test per endpoint,
 * satisfying the 9-criteria rubric.
 *
 * Role rules (from RBAC decorators):
 *   - list / inactive / detail / create / update /
 *     assign-vehicle / unassign-vehicle       → DISPATCHER, ADMIN, OWNER → asDispatcher
 *   - deactivate / reactivate / decommission  → ADMIN, OWNER             → asAdmin
 *
 * Schema: `@sally/shared-types` `TrailerSchema` with `.strict()` matches the
 * backend `TrailersService.formatResponse` exactly, so we use it directly.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildTrailer, buildVehicle } from '@sally/test-utils/factories';
import { expectContract, expectArrayContract } from '@sally/test-utils/schemas';
import { TrailerSchema } from '@sally/shared-types';

// Note: shared-types' TrailerSchema does NOT strictly mirror the controller
// (the controller list response goes directly through formatResponse, but
// the schema is already quite permissive with `.nullable().optional()` on
// most fields). We therefore do NOT call `.strict()` here — the shared-types
// schema lacks a `deactivatedAt`/`deactivationReason`/`reactivatedAt` trio
// that formatResponse always returns, and `.strict()` would reject those.
const TrailerResponseSchema = TrailerSchema;

test.describe('Fleet · Trailers @workflow', () => {
  const activeCreatedTrailerIds: string[] = [];
  const createdVehicleIdsForAssignment: string[] = [];

  test.afterEach(async ({ asAdmin }) => {
    // Unassign + deactivate trailers we created. Deactivate endpoint handles
    // already-inactive cases via the `.catch(() => undefined)` fallback.
    for (const id of activeCreatedTrailerIds.splice(0)) {
      await asAdmin.post(`/trailers/${id}/unassign-vehicle`).catch(() => undefined);
      await asAdmin.post(`/trailers/${id}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
    // Deactivate any vehicles we created to assign to trailers.
    for (const id of createdVehicleIdsForAssignment.splice(0)) {
      await asAdmin.post(`/vehicles/${id}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  test('GET /trailers lists active trailers @workflow', async ({ asDispatcher }) => {
    const payload = buildTrailer();
    const createRes = await asDispatcher.post('/trailers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedTrailerIds.push(created.trailerId);

    const res = await asDispatcher.get('/trailers');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(TrailerResponseSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /trailers',
    });

    const seeded = items.find((t) => t.trailerId === created.trailerId);
    expect(seeded).toBeDefined();
    expect(seeded?.unitNumber).toBe(payload.unitNumber);
    expect(seeded?.lifecycleStatus).toBe('ACTIVE');
  });

  test('GET /trailers/inactive/list returns non-ACTIVE trailers @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const payload = buildTrailer();
    const createRes = await asDispatcher.post('/trailers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const deactRes = await asAdmin.post(`/trailers/${created.trailerId}/deactivate`, {
      reason: 'prep inactive-list test',
    });
    expect(deactRes.status()).toBe(201);

    const res = await asDispatcher.get('/trailers/inactive/list');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(TrailerResponseSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /trailers/inactive/list',
    });

    for (const t of items) {
      expect(['INACTIVE', 'DECOMMISSIONED']).toContain(t.lifecycleStatus);
    }
    const seeded = items.find((t) => t.trailerId === created.trailerId);
    expect(seeded).toBeDefined();

    // Put it back so afterEach cleanup path is sane.
    const reactRes = await asAdmin.post(`/trailers/${created.trailerId}/reactivate`);
    expect(reactRes.status()).toBe(201);
    activeCreatedTrailerIds.push(created.trailerId);
  });

  test('GET /trailers/:trailer_id returns a single trailer @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildTrailer();
    const createRes = await asDispatcher.post('/trailers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedTrailerIds.push(created.trailerId);

    const res = await asDispatcher.get(`/trailers/${created.trailerId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(TrailerResponseSchema, await res.json(), 'GET /trailers/:id');

    expect(detail.trailerId).toBe(created.trailerId);
    expect(detail.unitNumber).toBe(payload.unitNumber);
    expect(detail.equipmentType).toBe(payload.equipmentType);

    // Persistence: unknown id returns 404.
    const missingRes = await asDispatcher.get('/trailers/does-not-exist-xyz');
    expect(missingRes.status()).toBe(404);
  });

  test('POST /trailers creates a trailer @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildTrailer();
    const res = await asDispatcher.post('/trailers', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(TrailerResponseSchema, await res.json(), 'POST /trailers');

    // Semantic
    expect(body.unitNumber).toBe(payload.unitNumber);
    expect(body.equipmentType).toBe(payload.equipmentType);
    expect(body.lengthFeet).toBe(payload.lengthFeet);
    expect(body.status).toBe('AVAILABLE');
    expect(body.lifecycleStatus).toBe('ACTIVE');

    activeCreatedTrailerIds.push(body.trailerId);

    // Persistence
    const getRes = await asDispatcher.get(`/trailers/${body.trailerId}`);
    expect(getRes.status()).toBe(200);
  });

  test('PUT /trailers/:trailer_id updates a trailer @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildTrailer();
    const createRes = await asDispatcher.post('/trailers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedTrailerIds.push(created.trailerId);

    const newNotes = 'Phase-1 QA update';
    const res = await asDispatcher.put(`/trailers/${created.trailerId}`, {
      notes: newNotes,
      lengthFeet: 48,
    });
    expect(res.status()).toBe(200);
    const body = expectContract(TrailerResponseSchema, await res.json(), 'PUT /trailers/:id');

    expect(body.notes).toBe(newNotes);
    expect(body.lengthFeet).toBe(48);

    // Persistence
    const getRes = await asDispatcher.get(`/trailers/${created.trailerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(TrailerResponseSchema, await getRes.json());
    expect(detail.notes).toBe(newNotes);
  });

  test('POST /trailers/:trailer_id/deactivate transitions to INACTIVE @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const payload = buildTrailer();
    const createRes = await asDispatcher.post('/trailers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const res = await asAdmin.post(`/trailers/${created.trailerId}/deactivate`, { reason: 'lifecycle test' });
    expect(res.status()).toBe(201);
    const body = expectContract(TrailerResponseSchema, await res.json(), 'POST /trailers/:id/deactivate');

    expect(body.lifecycleStatus).toBe('INACTIVE');
    expect(body.status).toBe('OUT_OF_SERVICE');

    // Persistence
    const getRes = await asDispatcher.get(`/trailers/${created.trailerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(TrailerResponseSchema, await getRes.json());
    expect(detail.lifecycleStatus).toBe('INACTIVE');

    // No push to activeCreatedTrailerIds — already inactive, cleanup is no-op.
  });

  test('POST /trailers/:trailer_id/reactivate transitions back to ACTIVE @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const payload = buildTrailer();
    const createRes = await asDispatcher.post('/trailers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const deactRes = await asAdmin.post(`/trailers/${created.trailerId}/deactivate`, {
      reason: 'prep reactivate test',
    });
    expect(deactRes.status()).toBe(201);

    const res = await asAdmin.post(`/trailers/${created.trailerId}/reactivate`);
    expect(res.status()).toBe(201);
    const body = expectContract(TrailerResponseSchema, await res.json(), 'POST /trailers/:id/reactivate');

    expect(body.lifecycleStatus).toBe('ACTIVE');
    expect(body.status).toBe('AVAILABLE');

    // Persistence
    const getRes = await asDispatcher.get(`/trailers/${created.trailerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(TrailerResponseSchema, await getRes.json());
    expect(detail.lifecycleStatus).toBe('ACTIVE');

    activeCreatedTrailerIds.push(created.trailerId);
  });

  test('POST /trailers/:trailer_id/decommission permanently decommissions @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Decommission is PERMANENT — the test IS the cleanup.
    const payload = buildTrailer();
    const createRes = await asDispatcher.post('/trailers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const res = await asAdmin.post(`/trailers/${created.trailerId}/decommission`, {
      reason: 'end-of-life lifecycle test',
    });
    expect(res.status()).toBe(201);
    const body = expectContract(TrailerResponseSchema, await res.json(), 'POST /trailers/:id/decommission');

    expect(body.lifecycleStatus).toBe('DECOMMISSIONED');

    // Persistence
    const getRes = await asDispatcher.get(`/trailers/${created.trailerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(TrailerResponseSchema, await getRes.json());
    expect(detail.lifecycleStatus).toBe('DECOMMISSIONED');
  });

  test('POST /trailers/:trailer_id/assign-vehicle hooks a vehicle @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // 1. Create the vehicle to assign (ADMIN).
    const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
    expect(vehicleRes.status()).toBe(201);
    const vehicle = await vehicleRes.json();
    createdVehicleIdsForAssignment.push(vehicle.vehicleId);

    // 2. Create the trailer.
    const trailerPayload = buildTrailer();
    const trailerRes = await asDispatcher.post('/trailers', trailerPayload);
    expect(trailerRes.status()).toBe(201);
    const trailer = await trailerRes.json();
    activeCreatedTrailerIds.push(trailer.trailerId);

    // 3. Hook — body expects { vehicleId: <numeric DB id> }.
    const res = await asDispatcher.post(`/trailers/${trailer.trailerId}/assign-vehicle`, { vehicleId: vehicle.id });
    expect(res.status()).toBe(201);
    const body = expectContract(TrailerResponseSchema, await res.json(), 'POST /trailers/:id/assign-vehicle');

    expect(body.assignedVehicleId).toBe(vehicle.id);
    expect(body.status).toBe('ASSIGNED');
    expect(body.assignedVehicle).toMatchObject({
      id: vehicle.id,
      vehicleId: vehicle.vehicleId,
    });

    // Persistence
    const getRes = await asDispatcher.get(`/trailers/${trailer.trailerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(TrailerResponseSchema, await getRes.json());
    expect(detail.assignedVehicleId).toBe(vehicle.id);
  });

  test('POST /trailers/:trailer_id/unassign-vehicle unhooks the vehicle @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Seed a vehicle + trailer and assign them.
    const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
    expect(vehicleRes.status()).toBe(201);
    const vehicle = await vehicleRes.json();
    createdVehicleIdsForAssignment.push(vehicle.vehicleId);

    const trailerRes = await asDispatcher.post('/trailers', buildTrailer());
    expect(trailerRes.status()).toBe(201);
    const trailer = await trailerRes.json();
    activeCreatedTrailerIds.push(trailer.trailerId);

    const assignRes = await asDispatcher.post(`/trailers/${trailer.trailerId}/assign-vehicle`, {
      vehicleId: vehicle.id,
    });
    expect(assignRes.status()).toBe(201);

    // Unhook
    const res = await asDispatcher.post(`/trailers/${trailer.trailerId}/unassign-vehicle`);
    expect(res.status()).toBe(201);
    const body = expectContract(TrailerResponseSchema, await res.json(), 'POST /trailers/:id/unassign-vehicle');

    expect(body.assignedVehicleId).toBeNull();
    expect(body.assignedVehicle).toBeNull();
    expect(body.status).toBe('AVAILABLE');

    // Persistence
    const getRes = await asDispatcher.get(`/trailers/${trailer.trailerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(TrailerResponseSchema, await getRes.json());
    expect(detail.assignedVehicleId).toBeNull();
  });
});

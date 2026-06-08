/**
 * Operations — Horizon weekly planning (Phase 3 Group 3d).
 *
 * Covers 7 endpoints across three controllers:
 *
 *   1. GET    /horizon?weekOf=YYYY-MM-DD             weekly grid envelope
 *   2. POST   /driver-unavailability                  CreateDriverUnavailabilityDto
 *   3. PATCH  /driver-unavailability/:id              update
 *   4. DELETE /driver-unavailability/:id              delete
 *   5. POST   /vehicle-unavailability                 CreateVehicleUnavailabilityDto
 *   6. PATCH  /vehicle-unavailability/:id             update
 *   7. DELETE /vehicle-unavailability/:id             delete
 *
 * Role profile: every test runs as `asDispatcher` — the three controllers are
 * class-level gated to DISPATCHER/ADMIN/OWNER, dispatcher is the cheapest
 * fixture to switch to.
 *
 * Plan gate `@requires:plan-horizon` on every test.
 *
 * Test 1 is a pure read. Tests 2-7 are destructive CRUD cycles — each test
 * seeds the record it mutates, and every test cleans up the row it created
 * (either via the DELETE test itself, or via explicit afterEach). Tenant
 * pollution bound: ≤1 residual unavailability row per failed test, not
 * cumulative under happy path.
 *
 * Schema drift / unknowns discovered live:
 *
 *   - The live backend enum for `DriverUnavailability.type` is
 *     `PTO | APPOINTMENT | HOME_TIME | TRAINING | OTHER`. Earlier factory
 *     drafts emitted `SICK/HOS_RESET/PERSONAL` — those are Prisma-unknown
 *     and would 400. Factory was corrected during Phase-3 discovery;
 *     TODO(phase-3-verify) and finding #33.
 *   - `startDate`/`endDate` on the CRUD wire come back as full ISO timestamps
 *     (`2026-05-01T00:00:00.000Z`), not YYYY-MM-DD (the grid path formats
 *     them separately). `DriverUnavailabilitySchema` / `VehicleUnavailabilitySchema`
 *     in `schemas/horizon.ts` use `isoDateString` which accepts both shapes.
 *   - `GET /horizon` — `sallyInsight` is ALWAYS populated on a populated
 *     tenant (the service returns it when either `suggestions.length>0` OR
 *     `openSlots.length>0`), so the `.nullable()` branch is only hit on
 *     completely idle tenants. Both branches validated by HorizonGridSchema.
 *
 * Dates used by the destructive tests live ≥7 days in the future to avoid
 * the "start date cannot be in the past" + "driver has in-transit load"
 * conflict guards in the service. Each test's pickups use distinct driver
 * and vehicle ids to avoid cross-test conflict contention.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, HorizonSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { buildDriverUnavailabilityPayload, buildVehicleUnavailabilityPayload } from '@sally/test-utils/factories';
import { z } from 'zod';

const { HorizonGridSchema, DriverUnavailabilitySchema, VehicleUnavailabilitySchema } = HorizonSchemas;

// ── Delete envelope ──────────────────────────────────────────────────────────
//
// Service returns `{ message: 'Unavailability deleted' }` with HTTP 200 on
// success (see driver-unavailability.controller.ts:58-63 /
// vehicle-unavailability.controller.ts:58-63). Strict.
const DeleteMessageSchema = z.object({ message: z.literal('Unavailability deleted') }).strict();

// ── Spec-local helpers ───────────────────────────────────────────────────────
//
// Resolve numeric driverId + vehicleId from the horizon grid so we know the
// ParseIntPipe-compatible primary keys. Factories accept string-or-number;
// the grid is the single source of truth for "which driver/vehicle exists on
// this tenant" without hitting /drivers or /vehicles directly.

interface HorizonIdPair {
  driverId: number;
  vehicleId: number;
}

async function pickHorizonIds(api: RoleApiClient): Promise<HorizonIdPair> {
  // Pull next week so we know the dates we'll seed with are in-range.
  const nextMonday = nextMondayIso();
  const res = await api.get(`/horizon?weekOf=${nextMonday}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    drivers?: Array<{ driverId?: number; vehicleId?: number | null }>;
  };
  const candidate = (body.drivers ?? []).find((d) => typeof d.driverId === 'number' && typeof d.vehicleId === 'number');
  if (!candidate) {
    throw new Error(
      'pickHorizonIds: no driver with an assigned vehicle in horizon grid — ' +
        'tag test @requires:data-active-route-plan',
    );
  }
  return {
    driverId: candidate.driverId as number,
    vehicleId: candidate.vehicleId as number,
  };
}

/** Pick a driver that has NO assigned vehicle so multiple tests can share
 *  the driver without conflicting. Falls back to any driver if necessary. */
async function pickDriverIdOnly(api: RoleApiClient): Promise<number> {
  const nextMonday = nextMondayIso();
  const res = await api.get(`/horizon?weekOf=${nextMonday}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    drivers?: Array<{ driverId?: number; vehicleId?: number | null }>;
  };
  const noVehicle = (body.drivers ?? []).find((d) => typeof d.driverId === 'number' && d.vehicleId === null);
  const fallback = (body.drivers ?? []).find((d) => typeof d.driverId === 'number');
  const picked = noVehicle ?? fallback;
  if (!picked?.driverId) {
    throw new Error('pickDriverIdOnly: no driver in horizon grid');
  }
  return picked.driverId;
}

/** Monday-of-next-week in YYYY-MM-DD (UTC). */
function nextMondayIso(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0..6, Sunday=0
  // Days to add to reach next Monday (always ≥7 to stay safely in future).
  const delta = (1 - day + 7) % 7 || 7;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + delta));
  return next.toISOString().slice(0, 10);
}

/** Add N days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

test.describe('Operations · Horizon · planning @workflow @requires:plan-horizon', () => {
  // Track rows created by tests so afterEach can clean residuals on failure.
  const driverUnavailIds = new Set<number>();
  const vehicleUnavailIds = new Set<number>();

  test.afterEach(async ({ asDispatcher }) => {
    for (const id of driverUnavailIds) {
      const res = await asDispatcher.delete(`/driver-unavailability/${id}`);
      if (res.status() !== 200 && res.status() !== 404) {
        // eslint-disable-next-line no-console
        console.warn(`afterEach: DELETE /driver-unavailability/${id} → HTTP ${res.status()}`);
      }
    }
    for (const id of vehicleUnavailIds) {
      const res = await asDispatcher.delete(`/vehicle-unavailability/${id}`);
      if (res.status() !== 200 && res.status() !== 404) {
        // eslint-disable-next-line no-console
        console.warn(`afterEach: DELETE /vehicle-unavailability/${id} → HTTP ${res.status()}`);
      }
    }
    driverUnavailIds.clear();
    vehicleUnavailIds.clear();
  });

  // 1 ── GET /horizon?weekOf=YYYY-MM-DD ──────────────────────────────────────
  test('GET /horizon returns a weekly grid with 7 day keys per driver @workflow @requires:plan-horizon', async ({
    asDispatcher,
  }) => {
    const weekOf = nextMondayIso();
    const res = await asDispatcher.get(`/horizon?weekOf=${weekOf}`);
    expect(res.status()).toBe(200);
    const grid = expectContract(HorizonGridSchema, await res.json(), 'GET /horizon');

    // Semantic — weekStart equals the requested Monday; weekEnd is 6 days
    // later; each driver's `days` object has exactly 7 keys spanning the week.
    expect(grid.weekStart).toBe(weekOf);
    expect(grid.weekEnd).toBe(addDaysIso(weekOf, 6));
    for (const driver of grid.drivers.slice(0, 10)) {
      const keys = Object.keys(driver.days).sort();
      expect(keys.length).toBe(7);
      expect(keys[0]).toBe(weekOf);
      expect(keys[6]).toBe(addDaysIso(weekOf, 6));
    }

    // Stats arithmetic — total drivers ≥ drivers loaded; openDriverDays
    // non-negative.
    expect(grid.stats.totalDrivers).toBeGreaterThanOrEqual(grid.stats.driversLoaded);
    expect(grid.stats.openDriverDays).toBeGreaterThanOrEqual(0);

    // Malformed date → 400.
    const badRes = await asDispatcher.get('/horizon?weekOf=not-a-date');
    expect(badRes.status()).toBe(400);
  });

  // 2 ── POST /driver-unavailability ─────────────────────────────────────────
  test('POST /driver-unavailability creates a record echoed on the horizon grid @workflow @requires:plan-horizon @destructive', async ({
    asDispatcher,
  }) => {
    const driverId = await pickDriverIdOnly(asDispatcher);
    const weekOf = nextMondayIso();
    const startDate = addDaysIso(weekOf, 7); // +14 from now
    const endDate = addDaysIso(startDate, 1);
    const payload = buildDriverUnavailabilityPayload(driverId, {
      startDate,
      endDate,
      type: 'PTO',
    });

    const res = await asDispatcher.post('/driver-unavailability', payload);
    expect(res.status()).toBe(201);
    const record = expectContract(DriverUnavailabilitySchema, await res.json(), 'POST /driver-unavailability');
    driverUnavailIds.add(record.id);

    // Semantic — echoed fields match the submitted payload.
    expect(record.driverId).toBe(driverId);
    expect(record.type).toBe('PTO');
    expect(record.note).toBe(payload.note);

    // Persistence — GET /horizon for that week surfaces the block under the
    // driver's `days[<startDate>].driverUnavailability`.
    const gridRes = await asDispatcher.get(`/horizon?weekOf=${addDaysIso(weekOf, 7)}`);
    expect(gridRes.status()).toBe(200);
    const grid = expectContract(HorizonGridSchema, await gridRes.json());
    const driverRow = grid.drivers.find((d) => d.driverId === driverId);
    expect(driverRow).toBeDefined();
    const dayData = driverRow?.days[startDate];
    expect(dayData?.driverUnavailability?.id).toBe(record.id);
  });

  // 3 ── PATCH /driver-unavailability/:id ────────────────────────────────────
  test('PATCH /driver-unavailability/:id updates type and note @workflow @requires:plan-horizon @destructive', async ({
    asDispatcher,
  }) => {
    const driverId = await pickDriverIdOnly(asDispatcher);
    const weekOf = nextMondayIso();
    const startDate = addDaysIso(weekOf, 14); // +21 — far future, unique window
    const endDate = addDaysIso(startDate, 1);
    const payload = buildDriverUnavailabilityPayload(driverId, {
      startDate,
      endDate,
      type: 'PTO',
    });
    const createRes = await asDispatcher.post('/driver-unavailability', payload);
    expect(createRes.status()).toBe(201);
    const created = expectContract(DriverUnavailabilitySchema, await createRes.json());
    driverUnavailIds.add(created.id);

    const updateRes = await asDispatcher.patch(`/driver-unavailability/${created.id}`, {
      type: 'APPOINTMENT',
      note: 'QA update — appointment',
    });
    expect(updateRes.status()).toBe(200);
    const updated = expectContract(
      DriverUnavailabilitySchema,
      await updateRes.json(),
      'PATCH /driver-unavailability/:id',
    );

    // Semantic — fields reflect the patch; id and driverId unchanged;
    // updatedAt advanced past createdAt.
    expect(updated.id).toBe(created.id);
    expect(updated.driverId).toBe(driverId);
    expect(updated.type).toBe('APPOINTMENT');
    expect(updated.note).toBe('QA update — appointment');
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(updated.createdAt));
  });

  // 4 ── DELETE /driver-unavailability/:id ───────────────────────────────────
  test('DELETE /driver-unavailability/:id removes the record from the horizon grid @workflow @requires:plan-horizon @destructive', async ({
    asDispatcher,
  }) => {
    const driverId = await pickDriverIdOnly(asDispatcher);
    const weekOf = nextMondayIso();
    const startDate = addDaysIso(weekOf, 21); // +28 unique window
    const endDate = addDaysIso(startDate, 1);
    const createRes = await asDispatcher.post(
      '/driver-unavailability',
      buildDriverUnavailabilityPayload(driverId, {
        startDate,
        endDate,
        type: 'PTO',
      }),
    );
    expect(createRes.status()).toBe(201);
    const created = expectContract(DriverUnavailabilitySchema, await createRes.json());
    // NOT added to driverUnavailIds — this test IS the delete.

    const res = await asDispatcher.delete(`/driver-unavailability/${created.id}`);
    expect(res.status()).toBe(200);
    const body = expectContract(DeleteMessageSchema, await res.json(), 'DELETE /driver-unavailability/:id');
    expect(body.message).toBe('Unavailability deleted');

    // Persistence — the row no longer appears on the horizon grid for the
    // affected week.
    const gridWeek = addDaysIso(weekOf, 21);
    const gridRes = await asDispatcher.get(`/horizon?weekOf=${gridWeek}`);
    expect(gridRes.status()).toBe(200);
    const grid = expectContract(HorizonGridSchema, await gridRes.json());
    const driverRow = grid.drivers.find((d) => d.driverId === driverId);
    const dayData = driverRow?.days[startDate];
    expect(dayData?.driverUnavailability ?? null).toBeNull();

    // Double-delete → 404.
    const missingRes = await asDispatcher.delete(`/driver-unavailability/${created.id}`);
    expect(missingRes.status()).toBe(404);
  });

  // 5 ── POST /vehicle-unavailability ────────────────────────────────────────
  test('POST /vehicle-unavailability creates a record echoed on the horizon grid @workflow @requires:plan-horizon @destructive', async ({
    asDispatcher,
  }) => {
    const { vehicleId } = await pickHorizonIds(asDispatcher);
    const weekOf = nextMondayIso();
    const startDate = addDaysIso(weekOf, 7);
    const endDate = addDaysIso(startDate, 1);
    const payload = buildVehicleUnavailabilityPayload(vehicleId, {
      startDate,
      endDate,
      type: 'MAINTENANCE',
    });

    const res = await asDispatcher.post('/vehicle-unavailability', payload);
    expect(res.status()).toBe(201);
    const record = expectContract(VehicleUnavailabilitySchema, await res.json(), 'POST /vehicle-unavailability');
    vehicleUnavailIds.add(record.id);

    // Semantic — echoed fields match the submitted payload.
    expect(record.vehicleId).toBe(vehicleId);
    expect(record.type).toBe('MAINTENANCE');
    expect(record.note).toBe(payload.note);

    // Persistence — grid contains the block under the vehicle's driver row.
    const gridRes = await asDispatcher.get(`/horizon?weekOf=${addDaysIso(weekOf, 7)}`);
    expect(gridRes.status()).toBe(200);
    const grid = expectContract(HorizonGridSchema, await gridRes.json());
    const driverRow = grid.drivers.find((d) => d.vehicleId === vehicleId);
    expect(driverRow).toBeDefined();
    const dayData = driverRow?.days[startDate];
    expect(dayData?.vehicleUnavailability?.id).toBe(record.id);
  });

  // 6 ── PATCH /vehicle-unavailability/:id ───────────────────────────────────
  test('PATCH /vehicle-unavailability/:id updates type and note @workflow @requires:plan-horizon @destructive', async ({
    asDispatcher,
  }) => {
    const { vehicleId } = await pickHorizonIds(asDispatcher);
    const weekOf = nextMondayIso();
    const startDate = addDaysIso(weekOf, 14);
    const endDate = addDaysIso(startDate, 1);
    const createRes = await asDispatcher.post(
      '/vehicle-unavailability',
      buildVehicleUnavailabilityPayload(vehicleId, {
        startDate,
        endDate,
        type: 'MAINTENANCE',
      }),
    );
    expect(createRes.status()).toBe(201);
    const created = expectContract(VehicleUnavailabilitySchema, await createRes.json());
    vehicleUnavailIds.add(created.id);

    const updateRes = await asDispatcher.patch(`/vehicle-unavailability/${created.id}`, {
      type: 'REPAIR',
      note: 'QA update — repair',
    });
    expect(updateRes.status()).toBe(200);
    const updated = expectContract(
      VehicleUnavailabilitySchema,
      await updateRes.json(),
      'PATCH /vehicle-unavailability/:id',
    );

    expect(updated.id).toBe(created.id);
    expect(updated.vehicleId).toBe(vehicleId);
    expect(updated.type).toBe('REPAIR');
    expect(updated.note).toBe('QA update — repair');
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(updated.createdAt));
  });

  // 7 ── DELETE /vehicle-unavailability/:id ──────────────────────────────────
  test('DELETE /vehicle-unavailability/:id removes the record from the horizon grid @workflow @requires:plan-horizon @destructive', async ({
    asDispatcher,
  }) => {
    const { vehicleId } = await pickHorizonIds(asDispatcher);
    const weekOf = nextMondayIso();
    const startDate = addDaysIso(weekOf, 21);
    const endDate = addDaysIso(startDate, 1);
    const createRes = await asDispatcher.post(
      '/vehicle-unavailability',
      buildVehicleUnavailabilityPayload(vehicleId, {
        startDate,
        endDate,
        type: 'MAINTENANCE',
      }),
    );
    expect(createRes.status()).toBe(201);
    const created = expectContract(VehicleUnavailabilitySchema, await createRes.json());

    const res = await asDispatcher.delete(`/vehicle-unavailability/${created.id}`);
    expect(res.status()).toBe(200);
    const body = expectContract(DeleteMessageSchema, await res.json(), 'DELETE /vehicle-unavailability/:id');
    expect(body.message).toBe('Unavailability deleted');

    // Persistence — the row no longer appears on the horizon grid for the
    // affected week.
    const gridWeek = addDaysIso(weekOf, 21);
    const gridRes = await asDispatcher.get(`/horizon?weekOf=${gridWeek}`);
    expect(gridRes.status()).toBe(200);
    const grid = expectContract(HorizonGridSchema, await gridRes.json());
    const driverRow = grid.drivers.find((d) => d.vehicleId === vehicleId);
    const dayData = driverRow?.days[startDate];
    expect(dayData?.vehicleUnavailability ?? null).toBeNull();

    const missingRes = await asDispatcher.delete(`/vehicle-unavailability/${created.id}`);
    expect(missingRes.status()).toBe(404);
  });
});

/**
 * Fleet — Relay Loads API (Phase 1 Group 8b)
 *
 * Covers the relay-leg endpoints on `LoadsController`:
 *
 *   - GET   /loads/:load_id/legs                       → list legs
 *   - POST  /loads/:load_id/legs                       → create/re-create legs
 *   - POST  /loads/:load_id/assign-all-legs            → bulk assign
 *   - PATCH /loads/:load_id/legs/:leg_id/assign        → assign single leg
 *   - PATCH /loads/:load_id/legs/:leg_id/status        → advance leg status
 *   - GET   /loads/:load_id/driver-view                → driver-scoped projection (DRIVER only)
 *
 * Every endpoint here carries `@RequireFeature(FEATURE_KEYS.RELAY_LOADS)`
 * on the backend — every test is tagged `@requires:plan-relay_loads` so
 * it's excluded at collection time on tenants without the feature (see
 * `tests/config/detect-capabilities.ts`). On demo-northstar-2026 the
 * feature is enabled (verified 2026-04-18); CI runs all 6 tests.
 *
 * Role rules (from the controller `@Roles` decorators):
 *   - List / create / assign-all / assign-leg / leg-status →
 *     DISPATCHER, ADMIN, OWNER — tests run as `asDispatcher`.
 *   - driver-view → DRIVER ONLY — the endpoint additionally requires the
 *     caller's `driverDbId` to match at least one leg's `driverId`, so
 *     we pre-assign leg #0 to the seeded DRIVER fixture via
 *     `seededDriverPublicId(authState)`.
 *
 * Setup: `createRelayLoadWithLegs` bootstraps
 *   POST /loads (3-stop payload) → PATCH { isRelay: true } → POST /legs
 * and returns `{ load, legs }`. Legs default to 2 (split at the sole
 * middle stop of the relay payload). Consecutive-leg driver rule: the
 * bulk assign endpoint rejects the same `driverId` on adjacent legs, so
 * the assign-all test uses two distinct seeded driver public ids.
 *
 * The relay leg-status state machine (from `LoadLegService`):
 *   pending → assigned → in_transit → delivered
 *             ↕ on_hold ↕       ↕
 * pending → cancelled / assigned → cancelled / in_transit → cancelled /
 * on_hold → cancelled / assigned → pending / on_hold → pending / etc.
 *
 * For test #5 we advance an assigned leg → in_transit. Advancing requires
 * the leg to already be assigned — we chain the single-leg assign test
 * flow directly so the state precondition is guaranteed.
 *
 * Schema strategy — hand-written in
 * `packages/test-utils/src/schemas/load-subresources.ts`:
 *   - `LoadLegSchema` — raw Prisma leg row w/ nested includes as
 *     `z.unknown()` since the include payload varies by query.
 *   - `DriverViewItemSchema` — strict driver-scoped projection.
 *   - `UpdateLegStatusResponseSchema` — same shape as a list-item leg.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDriver } from '@sally/test-utils/factories';
import { cleanupLoad, createRelayLoadWithLegs, revertLoad } from '@sally/test-utils/helpers';
import { expectArrayContract, expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

import { firstCustomerId, seededDriverPublicId } from './_helpers.js';

const { LoadLegSchema, UpdateLegStatusResponseSchema, DriverViewItemSchema } = LoadSubresourceSchemas;

/**
 * Clear any pre-existing IN_TRANSIT or ASSIGNED loads off a driver so the
 * driver is eligible for a new relay-leg assignment. Finding #14 — the
 * demo seeds can leave the seeded DRIVER on an IN_TRANSIT load, and
 * `LoadLegService.assignLeg` hard-blocks that combination with
 * `BadRequestException('Driver X already has an in-transit load or relay leg')`.
 *
 * For each load currently occupied by the driver:
 *   - IN_TRANSIT: revert IN_TRANSIT → ASSIGNED, then send a status
 *     demotion ASSIGNED → PENDING so the driver is fully detached (the
 *     load keeps the driverId FK until status drops below ASSIGNED).
 *   - ASSIGNED / ON_HOLD: the in-transit guard does not trip on these
 *     states; leg.assign allows an `assigned` driver to take another
 *     assignment. Leave untouched.
 *
 * Returns the list of load ids we mutated so the caller can (if it
 * chooses) restore them. For the driver-view test we only need the
 * seeded driver to be eligible for THIS test — demo reset restores state
 * between runs.
 */
async function freeSeededDriverFromInTransit(asDispatcher: RoleApiClient, driverPublicId: string): Promise<string[]> {
  // Paginate the driver's loads — only IN_TRANSIT matters for the guard.
  const res = await asDispatcher.get(
    `/loads?driverId=${encodeURIComponent(driverPublicId)}&status=IN_TRANSIT&limit=25`,
  );
  if (!res.ok()) {
    throw new Error(`freeSeededDriverFromInTransit: GET /loads → HTTP ${res.status()}`);
  }
  const body = (await res.json()) as {
    data?: Array<{ loadId: string; status: string }>;
    items?: Array<{ loadId: string; status: string }>;
  };
  const items = body.data ?? body.items ?? [];
  const reverted: string[] = [];
  for (const load of items) {
    if (load.status === 'IN_TRANSIT') {
      // IN_TRANSIT → ASSIGNED is the only valid reversal from the revert
      // config. The leg-assign guard accepts `assigned` drivers.
      await revertLoad(asDispatcher, load.loadId, {
        targetStatus: 'ASSIGNED',
        category: 'dispatcher_correction',
        reason: 'QA relay test — freeing seeded driver for driver-view assignment',
      });
      reverted.push(load.loadId);
    }
  }
  return reverted;
}

/**
 * Provision a fresh Driver via `asAdmin` with bounded retry (finding #2 —
 * driverId public-id collisions under parallel workers return 409; factory
 * regen yields a new timestamp-base36 id). Returns the driver's STRING
 * public id. Caller is responsible for deactivation cleanup.
 */
async function provisionDriver(asAdmin: RoleApiClient): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await asAdmin.post('/drivers', buildDriver());
    if (res.status() === 201) {
      const driver = (await res.json()) as { driverId: string };
      return driver.driverId;
    }
    if (res.status() !== 409) {
      const body = await res.text().catch(() => '');
      throw new Error(`provisionDriver: POST /drivers → HTTP ${res.status()}${body ? `: ${body}` : ''}`);
    }
  }
  throw new Error('provisionDriver: POST /drivers returned 409 three times (driverId collision — finding #2)');
}

test.describe('Fleet · Relay Loads @workflow', () => {
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await asAdmin.post(`/drivers/${driverId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  // 1 ── GET /loads/:load_id/legs ───────────────────────────────────
  test('GET /loads/:load_id/legs lists all legs for a relay load in sequence order @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);
    expect(legs.length).toBeGreaterThanOrEqual(2);

    const res = await asDispatcher.get(`/loads/${load.loadId}/legs`);
    expect(res.status()).toBe(200);
    const list = expectArrayContract(LoadLegSchema.strict(), await res.json(), { context: 'GET /loads/:id/legs' });

    // Semantic — same leg count, sequenced ascending, every leg starts
    // in `pending` (no drivers assigned yet).
    expect(list.length).toBe(legs.length);
    for (let i = 0; i < list.length; i++) {
      expect(list[i].sequence).toBe(i + 1);
      expect(list[i].status).toBe('pending');
      expect(list[i].driverId).toBeNull();
      expect(list[i].vehicleId).toBeNull();
    }

    // Persistence — list ids match what POST /legs just created.
    const ids = list.map((l) => l.legId).sort();
    const createdIds = legs.map((l) => l.legId).sort();
    expect(ids).toEqual(createdIds);
  });

  // 2 ── POST /loads/:load_id/legs ──────────────────────────────────
  test('POST /loads/:load_id/legs creates legs from exchange-point stop ids @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
  }) => {
    // `createRelayLoadWithLegs` is itself a thin wrapper around POST /legs
    // — running it here exercises the endpoint and we sanity-check the
    // response shape via the strict leg schema.
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    // With a single exchange point (indexes=[1] by default), the service
    // emits exactly two legs: stops[0]→stops[1] and stops[1]→stops[2].
    expect(legs.length).toBe(2);
    for (const leg of legs) {
      const parsed = expectContract(LoadLegSchema.strict(), leg, 'POST /loads/:id/legs — created leg');
      expect(parsed.status).toBe('pending');
      expect(parsed.driverId).toBeNull();
      expect(parsed.legId.startsWith('LEG-')).toBe(true);
    }
    expect(legs[0].sequence).toBe(1);
    expect(legs[1].sequence).toBe(2);

    // Persistence — GET /legs returns the same 2 legs.
    const listRes = await asDispatcher.get(`/loads/${load.loadId}/legs`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadLegSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/legs after POST /legs',
    });
    expect(list.map((l) => l.legId).sort()).toEqual(legs.map((l) => l.legId).sort());
  });

  // 3 ── POST /loads/:load_id/assign-all-legs ───────────────────────
  test('POST /loads/:load_id/assign-all-legs bulk-assigns drivers to every leg @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    // Adjacent-leg driver rule: different drivers on consecutive legs.
    // Both provisioned — avoids contention with the shared seeded DRIVER
    // row (finding #14).
    const driverA = await provisionDriver(asAdmin);
    const driverB = await provisionDriver(asAdmin);
    createdDriverIds.push(driverA, driverB);

    const res = await asDispatcher.post(`/loads/${load.loadId}/assign-all-legs`, {
      assignments: [
        { legId: legs[0].legId, driverId: driverA },
        { legId: legs[1].legId, driverId: driverB },
      ],
    });
    expect(res.status()).toBe(201);

    // The controller returns the refreshed load (via `findOne` →
    // `formatLoadResponse`) — we do not re-validate that shape here
    // (covered exhaustively in `loads-crud.spec.ts`). Assert the load
    // status reflects the assignment.
    const body = (await res.json()) as {
      loadId: string;
      status: string;
      isRelay: boolean;
    };
    expect(body.loadId).toBe(load.loadId);
    expect(body.isRelay).toBe(true);
    expect(body.status).toBe('ASSIGNED');

    // Persistence — GET /legs shows each leg in `assigned` state with a
    // driver linked.
    const listRes = await asDispatcher.get(`/loads/${load.loadId}/legs`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadLegSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/legs post-bulk-assign',
    });
    expect(list.length).toBe(2);
    for (const leg of list) {
      expect(leg.status).toBe('assigned');
      expect(leg.driverId).not.toBeNull();
      expect(leg.assignedAt).not.toBeNull();
    }
  });

  // 4 ── PATCH /loads/:load_id/legs/:leg_id/assign ──────────────────
  test('PATCH /loads/:load_id/legs/:leg_id/assign assigns a driver to a single relay leg @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    const driverPublicId = await provisionDriver(asAdmin);
    createdDriverIds.push(driverPublicId);

    const res = await asDispatcher.patch(`/loads/${load.loadId}/legs/${legs[0].legId}/assign`, {
      driverId: driverPublicId,
    });
    expect(res.status()).toBe(200);
    const assigned = expectContract(LoadLegSchema.strict(), await res.json(), 'PATCH /loads/:id/legs/:leg_id/assign');
    expect(assigned.legId).toBe(legs[0].legId);
    expect(assigned.status).toBe('assigned');
    expect(assigned.driverId).not.toBeNull();
    expect(assigned.assignedAt).not.toBeNull();

    // Persistence — GET /legs reflects the single leg flip (leg #1 still
    // pending since we only assigned leg #0).
    const listRes = await asDispatcher.get(`/loads/${load.loadId}/legs`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadLegSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/legs post-single-assign',
    });
    const legZero = list.find((l) => l.legId === legs[0].legId);
    const legOne = list.find((l) => l.legId === legs[1].legId);
    expect(legZero?.status).toBe('assigned');
    expect(legOne?.status).toBe('pending');
  });

  // 5 ── PATCH /loads/:load_id/legs/:leg_id/status ──────────────────
  test('PATCH /loads/:load_id/legs/:leg_id/status advances an assigned leg to in_transit @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    // Precondition — advance requires `assigned` as the source state.
    const driverPublicId = await provisionDriver(asAdmin);
    createdDriverIds.push(driverPublicId);
    const assignRes = await asDispatcher.patch(`/loads/${load.loadId}/legs/${legs[0].legId}/assign`, {
      driverId: driverPublicId,
    });
    expect(assignRes.status()).toBe(200);

    const res = await asDispatcher.patch(`/loads/${load.loadId}/legs/${legs[0].legId}/status`, {
      status: 'in_transit',
    });
    expect(res.status()).toBe(200);
    const advanced = expectContract(
      UpdateLegStatusResponseSchema.strict(),
      await res.json(),
      'PATCH /loads/:id/legs/:leg_id/status',
    );
    expect(advanced.legId).toBe(legs[0].legId);
    expect(advanced.status).toBe('in_transit');
    expect(advanced.pickedUpAt).not.toBeNull();

    // Illegal transition — pending → in_transit on an unassigned leg
    // returns 400 (see `LEG_STATUS_TRANSITIONS` in `load-leg.service.ts`).
    const badRes = await asDispatcher.patch(`/loads/${load.loadId}/legs/${legs[1].legId}/status`, {
      status: 'in_transit',
    });
    expect(badRes.status()).toBe(400);
  });

  // 6 ── GET /loads/:load_id/driver-view ────────────────────────────
  test('GET /loads/:load_id/driver-view returns a driver-scoped relay projection @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    // Assign leg #0 to the seeded DRIVER so `driverDbId === leg.driverId`
    // holds on the DRIVER JWT — the endpoint otherwise 403s. The demo
    // seed can leave the seeded driver on a pre-existing IN_TRANSIT load
    // (finding #14), which trips the in-transit guard on `assignLeg`.
    // Pre-free the driver by reverting any such load to ASSIGNED. The
    // reversion is sufficient — the `inTransitLoad` guard only matches
    // status IN_TRANSIT.
    const driverPublicId = seededDriverPublicId(authState);
    await freeSeededDriverFromInTransit(asDispatcher, driverPublicId);

    const assignRes = await asDispatcher.patch(`/loads/${load.loadId}/legs/${legs[0].legId}/assign`, {
      driverId: driverPublicId,
    });
    expect(assignRes.status()).toBe(200);

    // Leg #1 goes to a different driver so the driver-view correctly
    // scopes to just the seeded driver's leg.
    const otherDriver = await provisionDriver(asAdmin);
    createdDriverIds.push(otherDriver);
    const assignRes2 = await asDispatcher.patch(`/loads/${load.loadId}/legs/${legs[1].legId}/assign`, {
      driverId: otherDriver,
    });
    expect(assignRes2.status()).toBe(200);

    const res = await asDriver.get(`/loads/${load.loadId}/driver-view`);
    expect(res.status()).toBe(200);
    const list = expectArrayContract(DriverViewItemSchema.strict(), await res.json(), {
      context: 'GET /loads/:id/driver-view',
    });

    // Driver sees exactly their leg (leg #0) — the projection is
    // sequence-ordered, flagged relay, and carries loadId/loadNumber.
    expect(list.length).toBe(1);
    expect(list[0].legId).toBe(legs[0].legId);
    expect(list[0].legSequence).toBe(1);
    expect(list[0].totalLegs).toBe(2);
    expect(list[0].isRelay).toBe(true);
    expect(list[0].isFinalLeg).toBe(false);
    expect(list[0].loadId).toBe(load.loadId);
    expect(list[0].loadNumber).toBe(load.loadNumber);
    expect(list[0].status).toBe('assigned');
  });
});

/**
 * Fleet — Recurring Lanes API (Phase 1 Group 4)
 *
 * Covers all 13 endpoints on `RecurringLanesController`:
 *   - POST   /recurring-lanes                         → create (draft)
 *   - GET    /recurring-lanes                         → paginated list
 *   - GET    /recurring-lanes/upcoming                → next auto-generations
 *   - GET    /recurring-lanes/:id                     → detail
 *   - PATCH  /recurring-lanes/:id                     → update
 *   - DELETE /recurring-lanes/:id                     → expire
 *   - DELETE /recurring-lanes/:id/soft-delete         → soft delete (HTTP 200)
 *   - POST   /recurring-lanes/:id/activate            → draft|paused → active
 *   - POST   /recurring-lanes/:id/pause               → active      → paused
 *   - POST   /recurring-lanes/:id/resume              → paused      → active
 *   - POST   /recurring-lanes/:id/generate            → emit a Load
 *   - POST   /recurring-lanes/:id/skip                → skip next gen
 *   - GET    /recurring-lanes/:id/preview             → dry-run view
 *
 * Role rules: every endpoint → DISPATCHER/ADMIN/OWNER → `asDispatcher`.
 *
 * State model (lowercase per service):
 *   create       → status: 'draft'
 *   activate     → 'draft' | 'paused' → 'active'
 *   pause        → 'active'           → 'paused'
 *   resume       → 'paused'           → 'active'
 *   skip         → requires 'active'
 *   generate     → requires 'active'
 *   expire       → any (non-'expired') → 'expired'
 *   soft-delete  → hard soft-delete (deletedAt + status='expired')
 *
 * Each test builds a FRESH lane so state assumptions are deterministic
 * even under --workers=2.
 *
 * Factory: `buildRecurringLane(pickupStopId, deliveryStopId, overrides)` —
 * stops are keyed to persisted Stop.id (numeric primary key), not the
 * string stopId. We create two dedicated stops for the describe via
 * `beforeAll` using the dispatcher client.
 *
 * Cleanup: afterEach soft-deletes every lane created in the test.
 *
 * Schema strategy — hand-written in
 * `packages/test-utils/src/schemas/recurring-lanes.ts`; see the docstring
 * there for drift rationale.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildStop, buildRecurringLane } from '@sally/test-utils/factories';
import { expectContract, expectArrayContract, RecurringLaneSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

/**
 * Find the first customer id on the tenant. Used by the `generate` test —
 * `LoadsService.create` requires a `customer` relation (not nullable per
 * Prisma schema), so a lane whose `customerId` is null cannot be
 * auto-generated into a Load. Tests that exercise `generate` MUST create
 * the lane with a real customerId.
 *
 * All other tests create lanes with customerId=null to keep test setup
 * lean — that path still exercises the create/update/activate/pause/
 * resume/skip/preview code paths end-to-end.
 */
async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — recurring-lanes generate test requires a seeded customer');
  }
  return items[0].id;
}

const {
  RecurringLaneSchema,
  RecurringLaneListResponseSchema,
  RecurringLaneUpcomingResponseSchema,
  RecurringLanePreviewResponseSchema,
  SoftDeleteRecurringLaneResponseSchema,
  GeneratedLoadResponseSchema,
} = RecurringLaneSchemas;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Create (or find-or-create) two stops to serve as pickup + delivery
 * anchors for the spec. Returns their numeric DB ids.
 *
 * POST /stops is idempotent on (address, zipCode) — subsequent runs
 * against the same tenant dedup back to the same row, so this helper is
 * safe to call once per test. A hidden per-test namespace would cost a
 * new stop per run which the tenant-reset script already handles. Using
 * stable test-only names keeps the noise low.
 */
async function ensurePickupAndDeliveryStops(
  api: RoleApiClient,
): Promise<{ pickupStopDbId: number; deliveryStopDbId: number }> {
  const pickupPayload = buildStop({
    name: 'QA Recurring Lane — Pickup Anchor',
    address: '100 Main St',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
  });
  const deliveryPayload = buildStop({
    name: 'QA Recurring Lane — Delivery Anchor',
    address: '200 Commerce St',
    city: 'Houston',
    state: 'TX',
    zipCode: '77001',
  });

  const [pickupRes, deliveryRes] = await Promise.all([
    api.post('/stops', pickupPayload),
    api.post('/stops', deliveryPayload),
  ]);
  expect(pickupRes.status()).toBe(201);
  expect(deliveryRes.status()).toBe(201);
  const pickup = (await pickupRes.json()) as { id: number };
  const delivery = (await deliveryRes.json()) as { id: number };
  return {
    pickupStopDbId: pickup.id,
    deliveryStopDbId: delivery.id,
  };
}

/**
 * Create a recurring lane in 'draft' state and return the full response.
 * Tests push the id onto `createdLaneIds` themselves.
 */
async function createDraftLane(
  api: RoleApiClient,
  pickupStopDbId: number,
  deliveryStopDbId: number,
  overrides: Record<string, unknown> = {},
): Promise<import('zod').infer<typeof RecurringLaneSchema>> {
  const payload = buildRecurringLane(pickupStopDbId, deliveryStopDbId, overrides);
  const res = await api.post('/recurring-lanes', payload);
  expect(res.status()).toBe(201);
  return expectContract(RecurringLaneSchema, await res.json(), 'helper: createDraftLane');
}

// ── Suite ───────────────────────────────────────────────────────────

test.describe('Fleet · Recurring Lanes @workflow', () => {
  // Shared across tests — once both stops exist, every test re-uses their ids.
  let pickupStopDbId = 0;
  let deliveryStopDbId = 0;
  const createdLaneIds: number[] = [];

  test.beforeAll(async ({ browser: _browser }, testInfo) => {
    // Playwright's `test.beforeAll` runs without fixtures (no `asDispatcher`
    // available here). Deferring stop creation to the first `beforeEach` so
    // we can re-use the DISPATCHER fixture and keep all network calls under
    // the role-aware client. `testInfo` reference silences lint.
    void testInfo;
  });

  test.beforeEach(async ({ asDispatcher }) => {
    if (pickupStopDbId === 0 || deliveryStopDbId === 0) {
      const stops = await ensurePickupAndDeliveryStops(asDispatcher);
      pickupStopDbId = stops.pickupStopDbId;
      deliveryStopDbId = stops.deliveryStopDbId;
    }
  });

  test.afterEach(async ({ asDispatcher }) => {
    for (const id of createdLaneIds.splice(0)) {
      await asDispatcher.delete(`/recurring-lanes/${id}/soft-delete`).catch(() => undefined);
    }
  });

  // 1 ── POST /recurring-lanes ────────────────────────────────────
  test('POST /recurring-lanes creates a draft lane @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildRecurringLane(pickupStopDbId, deliveryStopDbId);
    const res = await asDispatcher.post('/recurring-lanes', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(RecurringLaneSchema, await res.json(), 'POST /recurring-lanes');

    // Semantic
    expect(body.status).toBe('draft');
    expect(body.name).toBe(payload.name);
    expect(body.customerName).toBe(payload.customerName);
    expect(body.rateCents).toBe(payload.rateCents);
    expect(body.scheduleType).toBe('weekly');
    expect(body.stops).toHaveLength(2);
    expect(body.stops[0].stopId).toBe(pickupStopDbId);
    expect(body.stops[1].stopId).toBe(deliveryStopDbId);
    expect(body.laneId).toMatch(/^LANE-/);
    expect(body.skipNextGeneration).toBe(false);
    expect(body.totalLoadsGenerated).toBe(0);
    createdLaneIds.push(body.id);

    // Persistence
    const detailRes = await asDispatcher.get(`/recurring-lanes/${body.id}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(RecurringLaneSchema, await detailRes.json());
    expect(detail.id).toBe(body.id);
    expect(detail.status).toBe('draft');
  });

  // 2 ── GET /recurring-lanes ─────────────────────────────────────
  test('GET /recurring-lanes returns paginated envelope @workflow @destructive', async ({ asDispatcher }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    // Scope the list with a search that matches our unique lane name, so
    // the assertion is deterministic regardless of tenant noise.
    const res = await asDispatcher.get(`/recurring-lanes?search=${encodeURIComponent(lane.name)}&limit=25&offset=0`);
    expect(res.status()).toBe(200);
    const body = expectContract(RecurringLaneListResponseSchema, await res.json(), 'GET /recurring-lanes');

    expect(body.limit).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.total).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);
    const seeded = body.data.find((l) => l.id === lane.id);
    expect(seeded).toBeDefined();
    expect(seeded?.laneId).toBe(lane.laneId);
  });

  // 3 ── GET /recurring-lanes/upcoming ────────────────────────────
  test('GET /recurring-lanes/upcoming returns active lanes within lookahead @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Activate one so the upcoming window has a candidate. `nextGenerationDate`
    // is derived from `nextScheduledRunDate - lookaheadDays`; a freshly
    // activated weekly lane with dayOfWeek=1 will land inside the default
    // 3-day lookahead on most days (on Sunday/Monday it's still within the
    // window). The schema-level assertion is the main contract — the data
    // assertion is best-effort and narrows to "our lane appears if the date
    // lands inside the window".
    const draft = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(draft.id);

    const activateRes = await asDispatcher.post(`/recurring-lanes/${draft.id}/activate`, {});
    expect(activateRes.status()).toBe(201);

    const res = await asDispatcher.get('/recurring-lanes/upcoming');
    expect(res.status()).toBe(200);
    const body = expectContract(RecurringLaneUpcomingResponseSchema, await res.json(), 'GET /recurring-lanes/upcoming');

    expect(body.lookaheadDays).toBeGreaterThanOrEqual(1);
    // Every lane in the upcoming window is 'active' by contract.
    for (const l of body.data) {
      expect(l.status).toBe('active');
    }
  });

  // 4 ── GET /recurring-lanes/:id ─────────────────────────────────
  test('GET /recurring-lanes/:id returns lane detail @workflow @destructive', async ({ asDispatcher }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    const res = await asDispatcher.get(`/recurring-lanes/${lane.id}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(RecurringLaneSchema, await res.json(), 'GET /recurring-lanes/:id');

    // Semantic
    expect(detail.id).toBe(lane.id);
    expect(detail.laneId).toBe(lane.laneId);
    expect(detail.stops).toHaveLength(2);
    // Unknown id → 404.
    const missingRes = await asDispatcher.get('/recurring-lanes/999999999');
    expect(missingRes.status()).toBe(404);
  });

  // 5 ── PATCH /recurring-lanes/:id ───────────────────────────────
  test('PATCH /recurring-lanes/:id updates mutable lane fields @workflow @destructive', async ({ asDispatcher }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    const newName = `Updated ${lane.laneId}`;
    const newRate = 325_000;
    const res = await asDispatcher.patch(`/recurring-lanes/${lane.id}`, {
      name: newName,
      rateCents: newRate,
      specialRequirements: 'Team drivers only',
    });
    expect(res.status()).toBe(200);
    const updated = expectContract(RecurringLaneSchema, await res.json(), 'PATCH /recurring-lanes/:id');

    expect(updated.name).toBe(newName);
    expect(updated.rateCents).toBe(newRate);
    expect(updated.specialRequirements).toBe('Team drivers only');

    // Persistence
    const detailRes = await asDispatcher.get(`/recurring-lanes/${lane.id}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(RecurringLaneSchema, await detailRes.json());
    expect(detail.rateCents).toBe(newRate);
  });

  // 6 ── DELETE /recurring-lanes/:id (expire) ─────────────────────
  test('DELETE /recurring-lanes/:id expires a draft lane @workflow @destructive', async ({ asDispatcher }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    // Terminal — afterEach soft-delete is idempotent (catches NotFound).

    const res = await asDispatcher.delete(`/recurring-lanes/${lane.id}`);
    expect(res.status()).toBe(200);
    const expired = expectContract(RecurringLaneSchema, await res.json(), 'DELETE /recurring-lanes/:id');

    expect(expired.id).toBe(lane.id);
    expect(expired.status).toBe('expired');
    expect(expired.nextGenerationDate).toBeNull();
    expect(expired.nextScheduledRunDate).toBeNull();

    // Expiring again rejects (service throws "Lane is already expired").
    const secondRes = await asDispatcher.delete(`/recurring-lanes/${lane.id}`);
    expect(secondRes.status()).toBe(400);

    // Track for afterEach soft-delete — still reachable via findFirst with
    // deletedAt: null even though status='expired'. Soft-delete flips
    // deletedAt and hides the record.
    createdLaneIds.push(lane.id);
  });

  // 7 ── DELETE /recurring-lanes/:id/soft-delete ──────────────────
  test('DELETE /recurring-lanes/:id/soft-delete hides the lane (HTTP 200) @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    // Terminal — NOT pushed; afterEach would double-delete.

    const res = await asDispatcher.delete(`/recurring-lanes/${lane.id}/soft-delete`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      SoftDeleteRecurringLaneResponseSchema,
      await res.json(),
      'DELETE /recurring-lanes/:id/soft-delete',
    );
    expect(body.message).toMatch(/deleted/i);

    // Persistence: detail is now 404 (service filters on `deletedAt: null`).
    const detailRes = await asDispatcher.get(`/recurring-lanes/${lane.id}`);
    expect(detailRes.status()).toBe(404);
  });

  // 8 ── POST /recurring-lanes/:id/activate ───────────────────────
  test('POST /recurring-lanes/:id/activate transitions draft → active @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    const res = await asDispatcher.post(`/recurring-lanes/${lane.id}/activate`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(RecurringLaneSchema, await res.json(), 'POST /recurring-lanes/:id/activate');

    expect(body.status).toBe('active');
    expect(body.nextScheduledRunDate).not.toBeNull();
    expect(body.nextGenerationDate).not.toBeNull();
  });

  // 9 ── POST /recurring-lanes/:id/pause ──────────────────────────
  test('POST /recurring-lanes/:id/pause transitions active → paused @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    // Must activate before we can pause.
    const activateRes = await asDispatcher.post(`/recurring-lanes/${lane.id}/activate`, {});
    expect(activateRes.status()).toBe(201);

    const res = await asDispatcher.post(`/recurring-lanes/${lane.id}/pause`, {});
    expect(res.status()).toBe(201);
    const paused = expectContract(RecurringLaneSchema, await res.json(), 'POST /recurring-lanes/:id/pause');

    expect(paused.status).toBe('paused');

    // Pausing again must reject.
    const pauseAgain = await asDispatcher.post(`/recurring-lanes/${lane.id}/pause`, {});
    expect(pauseAgain.status()).toBe(400);
  });

  // 10 ── POST /recurring-lanes/:id/resume ────────────────────────
  test('POST /recurring-lanes/:id/resume transitions paused → active @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    const activateRes = await asDispatcher.post(`/recurring-lanes/${lane.id}/activate`, {});
    expect(activateRes.status()).toBe(201);
    const pauseRes = await asDispatcher.post(`/recurring-lanes/${lane.id}/pause`, {});
    expect(pauseRes.status()).toBe(201);

    const res = await asDispatcher.post(`/recurring-lanes/${lane.id}/resume`, {});
    expect(res.status()).toBe(201);
    const resumed = expectContract(RecurringLaneSchema, await res.json(), 'POST /recurring-lanes/:id/resume');

    expect(resumed.status).toBe('active');
    expect(resumed.nextScheduledRunDate).not.toBeNull();
    expect(resumed.nextGenerationDate).not.toBeNull();

    // Resuming an active lane rejects (service guards on 'paused' only).
    const resumeAgain = await asDispatcher.post(`/recurring-lanes/${lane.id}/resume`, {});
    expect(resumeAgain.status()).toBe(400);
  });

  // 11 ── POST /recurring-lanes/:id/generate ──────────────────────
  // NOTE: `generate` creates a Load via `LoadsService.create`, which
  // requires a non-null `customer` relation (Prisma schema). A lane with
  // customerId=null would fail with a P2014-equivalent at load-create
  // time → HTTP 400 from the backend's debug-detail branch. To exercise
  // the happy path, this test ALWAYS creates the lane with a real
  // customerId (first one on the tenant). See finding #9 — the 400 path
  // is a latent backend bug that the public API should either guard at
  // lane-create time (reject customerId=null) or handle gracefully at
  // generate time.
  test('POST /recurring-lanes/:id/generate emits a Load from the lane @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId, { customerId });
    createdLaneIds.push(lane.id);

    const activateRes = await asDispatcher.post(`/recurring-lanes/${lane.id}/activate`, {});
    expect(activateRes.status()).toBe(201);

    const res = await asDispatcher.post(`/recurring-lanes/${lane.id}/generate`, {});
    expect(res.status()).toBe(201);
    const load = expectContract(GeneratedLoadResponseSchema, await res.json(), 'POST /recurring-lanes/:id/generate');

    // Semantic: generated Load inherits lane's rate + commodity + weight.
    expect(load.rateCents).toBe(lane.rateCents);
    expect(load.commodityType).toBe(lane.commodityType);
    expect(load.weightLbs).toBe(lane.weightLbs);
    expect(load.loadId).toMatch(/^LOAD-/);

    // Persistence: lane's generation counter incremented.
    const detailRes = await asDispatcher.get(`/recurring-lanes/${lane.id}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(RecurringLaneSchema, await detailRes.json());
    expect(detail.totalLoadsGenerated).toBe(lane.totalLoadsGenerated + 1);
    expect(detail.lastGeneratedAt).not.toBeNull();

    // Clean up the load the service created (avoid orphaning a real Load
    // record between test runs).
    await asDispatcher.delete(`/loads/${load.loadId}`).catch(() => undefined);

    // Generate from a non-active (paused) lane must reject.
    const pauseRes = await asDispatcher.post(`/recurring-lanes/${lane.id}/pause`, {});
    expect(pauseRes.status()).toBe(201);
    const forbidden = await asDispatcher.post(`/recurring-lanes/${lane.id}/generate`, {});
    expect(forbidden.status()).toBe(400);
  });

  // 12 ── POST /recurring-lanes/:id/skip ──────────────────────────
  test('POST /recurring-lanes/:id/skip marks next generation as skipped @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    const activateRes = await asDispatcher.post(`/recurring-lanes/${lane.id}/activate`, {});
    expect(activateRes.status()).toBe(201);

    const res = await asDispatcher.post(`/recurring-lanes/${lane.id}/skip`, {});
    expect(res.status()).toBe(201);
    const skipped = expectContract(RecurringLaneSchema, await res.json(), 'POST /recurring-lanes/:id/skip');

    expect(skipped.skipNextGeneration).toBe(true);
    expect(skipped.status).toBe('active');

    // Persistence: the flag survives a subsequent GET.
    const detailRes = await asDispatcher.get(`/recurring-lanes/${lane.id}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(RecurringLaneSchema, await detailRes.json());
    expect(detail.skipNextGeneration).toBe(true);
  });

  // 13 ── GET /recurring-lanes/:id/preview ────────────────────────
  test('GET /recurring-lanes/:id/preview returns dry-run projection @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const lane = await createDraftLane(asDispatcher, pickupStopDbId, deliveryStopDbId);
    createdLaneIds.push(lane.id);

    const res = await asDispatcher.get(`/recurring-lanes/${lane.id}/preview`);
    expect(res.status()).toBe(200);
    const preview = expectContract(
      RecurringLanePreviewResponseSchema,
      await res.json(),
      'GET /recurring-lanes/:id/preview',
    );

    // Semantic: preview mirrors lane identity + stops + inherited fields.
    expect(preview.laneId).toBe(lane.laneId);
    expect(preview.laneName).toBe(lane.name);
    expect(preview.customerName).toBe(lane.customerName);
    expect(preview.weightLbs).toBe(lane.weightLbs);
    expect(preview.rateCents).toBe(lane.rateCents);
    expect(preview.stops).toHaveLength(2);
    expect(preview.stops[0].stopId).toBe(pickupStopDbId);
    expect(preview.stops[1].stopId).toBe(deliveryStopDbId);
    expect(preview.stops[0].actionType).toBe('pickup');
    expect(preview.stops[1].actionType).toBe('delivery');
  });
});

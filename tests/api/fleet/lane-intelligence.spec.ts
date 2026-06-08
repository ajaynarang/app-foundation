/**
 * Fleet — Lane Intelligence API (Phase 1 Group 4)
 *
 * Covers all 4 endpoints on `LaneIntelligenceController`. Note the base
 * path is `/fleet` (NOT `/lane-intelligence`):
 *   - GET    /fleet/lane-rate?origin_state=...&destination_state=...  → rate insight
 *   - GET    /fleet/lane-rate-targets                                  → list targets
 *   - PUT    /fleet/lane-rate-targets                                  → upsert target
 *   - DELETE /fleet/lane-rate-targets/:lane_rate_target_id             → delete target
 *
 * The URL query parameters on `/fleet/lane-rate` are snake_case
 * (`origin_state`, `destination_state`, `equipment_type`) — matching the
 * `@Query('origin_state')` decorator — while the PUT body is camelCase per
 * the `UpsertLaneRateTargetDto`. Both are validated below.
 *
 * Role rules:
 *   - Every endpoint → DISPATCHER, ADMIN, OWNER → `asDispatcher`.
 *
 * Computed lane-rate data (`computed`) is null when the tenant has fewer
 * than 3 delivered loads on the lane in the last 90 days
 * (`MIN_LOADS_FOR_INSIGHT` in the service). The test asserts the envelope
 * contract and the upsert/delete round-trip; whether `computed` is null
 * on a particular lane is data-dependent and not asserted here beyond the
 * "nullable" rule.
 *
 * Cleanup: every lane rate target created by the spec is deleted in
 * afterEach via its `laneRateTargetId`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLaneRateTarget } from '@sally/test-utils/factories';
import { expectContract, expectArrayContract, LaneIntelligenceSchemas } from '@sally/test-utils/schemas';

const { LaneIntelligenceResponseSchema, LaneRateTargetSchema, DeleteLaneRateTargetResponseSchema } =
  LaneIntelligenceSchemas;

/**
 * Build a query string with snake_case keys for `GET /fleet/lane-rate`.
 * Matches the controller's `@Query('origin_state' | 'destination_state' |
 * 'equipment_type')` decorators verbatim.
 */
function buildLaneRateQuery(params: { originState: string; destinationState: string; equipmentType?: string }): string {
  const qs = new URLSearchParams({
    origin_state: params.originState,
    destination_state: params.destinationState,
  });
  if (params.equipmentType) {
    qs.set('equipment_type', params.equipmentType);
  }
  return qs.toString();
}

test.describe('Fleet · Lane Intelligence @workflow', () => {
  // Track target ids created by the spec so afterEach deletes them.
  const createdTargetIds: string[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const id of createdTargetIds.splice(0)) {
      await asDispatcher.delete(`/fleet/lane-rate-targets/${id}`).catch(() => undefined);
    }
  });

  // 1 ── GET /fleet/lane-rate ─────────────────────────────────────
  test('GET /fleet/lane-rate returns combined computed + target envelope @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Seed a target so we can positively assert the `target` branch as
    // non-null regardless of whether the tenant has enough historical loads
    // on this lane to compute a rate.
    const payload = buildLaneRateTarget({
      originState: 'TX',
      destinationState: 'CA',
      equipmentType: 'dry_van',
      targetRateCentsPerMile: 295,
    });
    const upsertRes = await asDispatcher.put('/fleet/lane-rate-targets', payload);
    expect(upsertRes.status()).toBe(200);
    const upserted = expectContract(LaneRateTargetSchema, await upsertRes.json());
    createdTargetIds.push(upserted.laneRateTargetId);

    const qs = buildLaneRateQuery({
      originState: 'TX',
      destinationState: 'CA',
      equipmentType: 'dry_van',
    });
    const res = await asDispatcher.get(`/fleet/lane-rate?${qs}`);
    expect(res.status()).toBe(200);
    const body = expectContract(LaneIntelligenceResponseSchema, await res.json(), 'GET /fleet/lane-rate');

    // Semantic: target matches the one we just upserted.
    expect(body.target).not.toBeNull();
    expect(body.target?.originState).toBe('TX');
    expect(body.target?.destinationState).toBe('CA');
    expect(body.target?.targetRateCentsPerMile).toBe(295);
    expect(body.target?.equipmentType).toBe('dry_van');

    // `computed` may be null (thin history) or an object — schema already
    // enforces the union; here we just exercise the null branch explicitly
    // for readability.
    if (body.computed !== null) {
      expect(body.computed.loadCount).toBeGreaterThanOrEqual(3);
      expect(['high', 'low', 'none']).toContain(body.computed.confidence);
    }
  });

  // 2 ── GET /fleet/lane-rate-targets ─────────────────────────────
  test('GET /fleet/lane-rate-targets lists tenant targets @workflow @destructive', async ({ asDispatcher }) => {
    // Seed a target so the list is non-empty regardless of tenant state.
    const payload = buildLaneRateTarget({
      originState: 'FL',
      destinationState: 'GA',
      equipmentType: 'reefer',
      targetRateCentsPerMile: 310,
      notes: 'Never below this on produce lanes',
    });
    const upsertRes = await asDispatcher.put('/fleet/lane-rate-targets', payload);
    expect(upsertRes.status()).toBe(200);
    const seeded = await upsertRes.json();
    createdTargetIds.push(seeded.laneRateTargetId);

    const res = await asDispatcher.get('/fleet/lane-rate-targets');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(LaneRateTargetSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /fleet/lane-rate-targets',
    });

    // Semantic: our seeded target is present with the correct fields.
    const ours = items.find((t) => t.laneRateTargetId === seeded.laneRateTargetId);
    expect(ours).toBeDefined();
    expect(ours?.originState).toBe('FL');
    expect(ours?.destinationState).toBe('GA');
    expect(ours?.targetRateCentsPerMile).toBe(310);
    expect(ours?.notes).toBe('Never below this on produce lanes');
    expect(ours?.equipmentType).toBe('reefer');
  });

  // 3 ── PUT /fleet/lane-rate-targets ─────────────────────────────
  test('PUT /fleet/lane-rate-targets upserts target (create then update) @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // First PUT — create.
    const initial = buildLaneRateTarget({
      originState: 'CO',
      destinationState: 'AZ',
      equipmentType: 'dry_van',
      targetRateCentsPerMile: 250,
      notes: 'initial',
    });
    const createRes = await asDispatcher.put('/fleet/lane-rate-targets', initial);
    expect(createRes.status()).toBe(200);
    const created = expectContract(
      LaneRateTargetSchema,
      await createRes.json(),
      'PUT /fleet/lane-rate-targets (create)',
    );
    expect(created.targetRateCentsPerMile).toBe(250);
    expect(created.notes).toBe('initial');
    createdTargetIds.push(created.laneRateTargetId);

    // Second PUT — same (origin, destination, equipment) key → updates in place.
    const updated = buildLaneRateTarget({
      originState: 'CO',
      destinationState: 'AZ',
      equipmentType: 'dry_van',
      targetRateCentsPerMile: 275,
      notes: 'bumped after Q2 rate review',
    });
    const updateRes = await asDispatcher.put('/fleet/lane-rate-targets', updated);
    expect(updateRes.status()).toBe(200);
    const after = expectContract(LaneRateTargetSchema, await updateRes.json(), 'PUT /fleet/lane-rate-targets (update)');

    // Semantic: same laneRateTargetId (upsert, not re-create) with new values.
    expect(after.laneRateTargetId).toBe(created.laneRateTargetId);
    expect(after.targetRateCentsPerMile).toBe(275);
    expect(after.notes).toBe('bumped after Q2 rate review');

    // Persistence: list reflects the most recent value.
    const listRes = await asDispatcher.get('/fleet/lane-rate-targets');
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(LaneRateTargetSchema, await listRes.json(), {
      allowEmpty: false,
      context: 'GET after PUT upsert',
    });
    const hit = items.find((t) => t.laneRateTargetId === created.laneRateTargetId);
    expect(hit).toBeDefined();
    expect(hit?.targetRateCentsPerMile).toBe(275);
  });

  // 4 ── DELETE /fleet/lane-rate-targets/:id ──────────────────────
  test('DELETE /fleet/lane-rate-targets/:lane_rate_target_id removes target @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Seed a unique target for this test so other tests are unaffected.
    const payload = buildLaneRateTarget({
      originState: 'NV',
      destinationState: 'UT',
      equipmentType: 'flatbed',
      targetRateCentsPerMile: 320,
    });
    const createRes = await asDispatcher.put('/fleet/lane-rate-targets', payload);
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();

    const res = await asDispatcher.delete(`/fleet/lane-rate-targets/${created.laneRateTargetId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      DeleteLaneRateTargetResponseSchema,
      await res.json(),
      'DELETE /fleet/lane-rate-targets/:id',
    );
    expect(body.success).toBe(true);

    // Persistence: the target is gone from the list.
    const listRes = await asDispatcher.get('/fleet/lane-rate-targets');
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(LaneRateTargetSchema, await listRes.json(), {
      allowEmpty: true,
      context: 'GET after DELETE',
    });
    const ghost = items.find((t) => t.laneRateTargetId === created.laneRateTargetId);
    expect(ghost).toBeUndefined();

    // Also: deleting again returns 404 (idempotency probe).
    const secondDel = await asDispatcher.delete(`/fleet/lane-rate-targets/${created.laneRateTargetId}`);
    expect(secondDel.status()).toBe(404);

    // Not pushed to createdTargetIds — already gone.
  });
});

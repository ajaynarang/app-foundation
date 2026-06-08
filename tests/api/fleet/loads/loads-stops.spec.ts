/**
 * Fleet — Loads Stops API (Phase 1 Group 6)
 *
 * Covers two stop-facing endpoints on `LoadsController`:
 *
 *   - GET   /loads/:load_id/stops                  → list load stops
 *   - PATCH /loads/:load_id/stops/:stop_id/status  → advance stop status
 *
 * Role rules (from `@Roles`): both endpoints are open to DRIVER as well
 * as DISPATCHER/ADMIN/OWNER. We exercise the dispatcher path here — the
 * driver path is covered by the driver-actions spec (Phase 1 Group 8).
 *
 * Stop identifier semantics: the controller path param `:stop_id` is
 * coerced via `Number(stopId)` inside `LoadsController.updateStopStatus`
 * and used as `LoadStop.id` (the numeric primary key of `LoadStop`, NOT
 * the string `stopId` on the Stop table). `GET /loads/:id/stops` returns
 * each item with `id: <LoadStop.id>` — that's what the test passes back
 * in the PATCH URL.
 *
 * Stop state machine (from `StopStatusService`):
 *   pending → arrived → in_progress → completed
 *
 * Auto-transition side effect: when the first `pickup` stop is marked
 * `completed` on an ASSIGNED load, the service auto-advances the load
 * itself to IN_TRANSIT (see `StopStatusService.updateStopStatus`
 * inner transaction). To exercise PATCH stop-status without tripping
 * that side effect (which would couple the stop test to driver+vehicle
 * provisioning), the PATCH test moves a stop only from `pending` →
 * `arrived` — a benign hop that leaves the load in its current state.
 */
import { test, expect } from '@sally/test-utils/auth';
import { cleanupLoad, createLoad } from '@sally/test-utils/helpers';
import { expectArrayContract, expectContract, LoadSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

const { LoadStopItemSchema, UpdateStopStatusResponseSchema } = LoadSchemas;

// ── Helpers ─────────────────────────────────────────────────────────

async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — loads-stops tests require a seeded customer');
  }
  return items[0].id;
}

test.describe('Fleet · Loads Stops @workflow', () => {
  const createdLoadIds: string[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
  });

  // 1 ── GET /loads/:load_id/stops ──────────────────────────────────
  test('GET /loads/:load_id/stops returns the load stops in sequenceOrder @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    const res = await asDispatcher.get(`/loads/${seed.loadId}/stops`);
    expect(res.status()).toBe(200);
    const stops = expectArrayContract(LoadStopItemSchema.strict(), await res.json(), {
      allowEmpty: false,
      context: 'GET /loads/:id/stops',
    });

    // Semantic — 2 stops, ordered pickup then delivery, in sequence 1/2,
    // all pending (fresh load has never been arrived-at).
    expect(stops).toHaveLength(2);
    expect(stops.map((s) => s.sequenceOrder)).toEqual([1, 2]);
    expect(stops.map((s) => s.actionType)).toEqual(['pickup', 'delivery']);
    for (const s of stops) {
      expect(s.status).toBe('pending');
      expect(s.arrivedAt).toBeNull();
      expect(s.completedAt).toBeNull();
    }

    // 404 for a load we don't own / doesn't exist.
    const missingRes = await asDispatcher.get('/loads/LOAD-does-not-exist/stops');
    expect(missingRes.status()).toBe(404);
  });

  // 2 ── PATCH /loads/:load_id/stops/:stop_id/status ────────────────
  test('PATCH /loads/:load_id/stops/:stop_id/status advances a pending stop to arrived @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seed = await createLoad(asDispatcher, customerId);
    createdLoadIds.push(seed.loadId);

    // Read the stops to learn the numeric LoadStop.id for the PATCH URL.
    const listRes = await asDispatcher.get(`/loads/${seed.loadId}/stops`);
    expect(listRes.status()).toBe(200);
    const stops = expectArrayContract(LoadStopItemSchema.strict(), await listRes.json(), { allowEmpty: false });
    const pickup = stops.find((s) => s.actionType === 'pickup');
    expect(pickup).toBeDefined();

    const res = await asDispatcher.patch(`/loads/${seed.loadId}/stops/${pickup!.id}/status`, { status: 'ARRIVED' });
    expect(res.status()).toBe(200);
    const body = expectContract(
      UpdateStopStatusResponseSchema.strict(),
      await res.json(),
      'PATCH /loads/:id/stops/:stop_id/status',
    );

    // Semantic — returned shape carries the stop id + new status + arrival ts.
    expect(body.stopId).toBe(pickup!.id);
    expect(body.status).toBe('ARRIVED');
    expect(body.arrivedAt).toBeDefined();

    // Persistence — re-read stops; the pickup row is now `ARRIVED`.
    const afterRes = await asDispatcher.get(`/loads/${seed.loadId}/stops`);
    expect(afterRes.status()).toBe(200);
    const after = expectArrayContract(LoadStopItemSchema.strict(), await afterRes.json(), { allowEmpty: false });
    const afterPickup = after.find((s) => s.id === pickup!.id);
    expect(afterPickup?.status).toBe('ARRIVED');
    expect(afterPickup?.arrivedAt).not.toBeNull();

    // Invalid transition: `PENDING → COMPLETED` is not allowed by the
    // state machine (would skip `ARRIVED` + `IN_PROGRESS`). The delivery
    // stop is still pending — try to skip straight to completed.
    const delivery = stops.find((s) => s.actionType === 'delivery');
    expect(delivery).toBeDefined();
    const invalidRes = await asDispatcher.patch(`/loads/${seed.loadId}/stops/${delivery!.id}/status`, {
      status: 'COMPLETED',
    });
    expect(invalidRes.status()).toBe(400);
  });
});

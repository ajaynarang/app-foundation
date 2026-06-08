/**
 * Fleet — Stops API (Phase 1 Group 3)
 *
 * Covers all 5 endpoints on StopsController:
 *   - GET   /stops         — paginated list
 *   - GET   /stops/search  — recent + query results
 *   - GET   /stops/:id     — single detail
 *   - POST  /stops         — create with dedup (returns { ...stop, isNew })
 *   - PATCH /stops/:id     — update (returns search-result shape)
 *
 * Role rules (from @Roles decorators):
 *   - Every endpoint → DISPATCHER, ADMIN, OWNER  → asDispatcher
 *
 * Soft cleanup note: there is NO `DELETE /stops/:id` endpoint, and
 * `CreateStopDto` / `UpdateStopDto` do not expose `isActive`, so stops
 * created by this spec cannot be deactivated via the public API. They are
 * left in place; `pnpm tenant:reset --mode hard` handles hard cleanup for
 * allow-listed demo tenants (see `.docs/plans/2026-04-17-qa-coverage`).
 * We still track IDs for logging/debugging and attempt a best-effort
 * PATCH noop in `afterEach` so any future soft-delete path is wired up.
 *
 * Schema fallbacks: shared-types `StopSearchResultSchema` matches only the
 * search endpoint; the list/detail/create/update shapes are not published.
 * We use the hand-written schemas in `packages/test-utils/src/schemas/stops.ts`
 * that mirror `StopsService` output verbatim. `.strict()` is intentionally
 * NOT applied to the Prisma-row shapes because the Stop table has a long
 * tail of optional fuel/amenity columns we do not want to enumerate.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildStop } from '@sally/test-utils/factories';
import { expectContract, StopSchemas } from '@sally/test-utils/schemas';

const {
  StopListResponseSchema,
  StopDetailSchema,
  StopSearchResponseSchema,
  CreateStopResponseSchema,
  UpdateStopResponseSchema,
} = StopSchemas;

test.describe('Fleet · Stops @workflow', () => {
  // Created stops cannot be DELETED via the public API (see file docstring),
  // so this array exists for debug/logging continuity only. Soft cleanup is
  // a no-op in afterEach.
  const createdStopIds: number[] = [];

  test.afterEach(async () => {
    // Intentionally empty — no deactivate/delete endpoint exposed.
    // Clear the tracker so the next test starts clean.
    createdStopIds.splice(0);
  });

  // 1 ── POST /stops ────────────────────────────────────────────────
  test('POST /stops creates a stop (dedup: isNew=true) @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildStop();
    const res = await asDispatcher.post('/stops', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(CreateStopResponseSchema, await res.json(), 'POST /stops');

    // Semantic: payload round-trips and isNew=true for a fresh address+zip.
    expect(body.name).toBe(payload.name);
    expect(body.address).toBe(payload.address);
    expect(body.city).toBe(payload.city);
    expect(body.state).toBe(payload.state);
    expect(body.zipCode).toBe(payload.zipCode);
    expect(body.isActive).toBe(true);
    expect(body.isNew).toBe(true);
    expect(body.stopId).toMatch(/^STOP-/);
    createdStopIds.push(body.id);

    // Persistence: GET /stops/:id returns the same record.
    const getRes = await asDispatcher.get(`/stops/${body.id}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(StopDetailSchema, await getRes.json());
    expect(detail.id).toBe(body.id);
    expect(detail.stopId).toBe(body.stopId);
  });

  // 2 ── GET /stops ─────────────────────────────────────────────────
  test('GET /stops returns paginated active stops @workflow', async ({ asDispatcher }) => {
    // Seed one with a predictable unique marker so we can scope the list
    // query and find it deterministically — demo tenants may have 100s of
    // seeded stops and unscoped pagination sorted by name won't land ours
    // on page 1.
    const marker = `QA-List-${Date.now()}`;
    const payload = buildStop({ name: marker });
    const createRes = await asDispatcher.post('/stops', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdStopIds.push(created.id);

    // First call — unscoped — validates the envelope shape + invariants.
    const envelopeRes = await asDispatcher.get('/stops?limit=25');
    expect(envelopeRes.status()).toBe(200);
    const envelope = expectContract(StopListResponseSchema, await envelopeRes.json(), 'GET /stops');
    expect(envelope.page).toBe(1);
    expect(envelope.limit).toBe(25);
    expect(envelope.total).toBeGreaterThan(0);
    expect(envelope.totalPages).toBeGreaterThanOrEqual(1);
    expect(envelope.items.length).toBeGreaterThan(0);
    expect(envelope.items.length).toBeLessThanOrEqual(envelope.limit);
    for (const item of envelope.items) {
      expect(item.isActive).toBe(true);
    }

    // Second call — scoped by our unique marker — verifies the `q` filter
    // and that our seeded stop is present with the expected metadata.
    const scopedRes = await asDispatcher.get(`/stops?q=${encodeURIComponent(marker)}&limit=25`);
    expect(scopedRes.status()).toBe(200);
    const scoped = expectContract(StopListResponseSchema, await scopedRes.json(), 'GET /stops?q=...');
    const seeded = scoped.items.find((s) => s.id === created.id);
    expect(seeded).toBeDefined();
    expect(seeded?.loadCount).toBe(0);
    expect(seeded?.isEditable).toBe(true);
    expect(seeded?.name).toBe(marker);
  });

  // 3 ── GET /stops/search ──────────────────────────────────────────
  test('GET /stops/search returns recent + query results @workflow @destructive', async ({ asDispatcher }) => {
    // Seed a stop with a predictable unique name we can search for.
    const marker = `QA-Search-${Date.now()}`;
    const payload = buildStop({ name: marker });
    const createRes = await asDispatcher.post('/stops', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdStopIds.push(created.id);

    const res = await asDispatcher.get(`/stops/search?q=${encodeURIComponent(marker)}&limit=20`);
    expect(res.status()).toBe(200);
    const body = expectContract(StopSearchResponseSchema, await res.json(), 'GET /stops/search');

    // Semantic: `results` contains our seeded stop (by unique marker name),
    // `recent` is an array (may be empty if the tenant has no load history).
    expect(Array.isArray(body.recent)).toBe(true);
    const hit = body.results.find((s) => s.name === marker);
    expect(hit).toBeDefined();
    expect(hit?.id).toBe(created.id);
    expect(hit?.stopId).toBe(created.stopId);
    expect(hit?.locationType).toBe('WAREHOUSE');

    // Persistence: a second call with the same query returns a superset of
    // the first (at minimum, the seeded stop).
    const secondRes = await asDispatcher.get(`/stops/search?q=${encodeURIComponent(marker)}`);
    expect(secondRes.status()).toBe(200);
    const second = expectContract(StopSearchResponseSchema, await secondRes.json());
    expect(second.results.some((s) => s.id === created.id)).toBe(true);
  });

  // 4 ── GET /stops/:id ─────────────────────────────────────────────
  test('GET /stops/:id returns single stop detail @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildStop();
    const createRes = await asDispatcher.post('/stops', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdStopIds.push(created.id);

    const res = await asDispatcher.get(`/stops/${created.id}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(StopDetailSchema, await res.json(), 'GET /stops/:id');

    // Semantic
    expect(detail.id).toBe(created.id);
    expect(detail.stopId).toBe(created.stopId);
    expect(detail.name).toBe(payload.name);
    expect(detail.isActive).toBe(true);
    expect(detail.isEditable).toBe(true);
    expect(detail.loadCount).toBe(0);

    // Persistence: a non-integer or out-of-range id surfaces as a 404 or 400
    // via `ParseIntPipe`. We exercise the 404 path with a real-looking but
    // unused numeric id.
    const missingRes = await asDispatcher.get('/stops/999999999');
    expect(missingRes.status()).toBe(404);
  });

  // 5 ── PATCH /stops/:id ───────────────────────────────────────────
  test('PATCH /stops/:id updates stop fields @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildStop();
    const createRes = await asDispatcher.post('/stops', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdStopIds.push(created.id);

    const newNotes = `Updated ${Date.now()} — QA patch`;
    const newContactName = 'Updated Dock Manager';
    const updateRes = await asDispatcher.patch(`/stops/${created.id}`, {
      notes: newNotes,
      contactName: newContactName,
      appointmentRequired: true,
    });
    expect(updateRes.status()).toBe(200);
    const updated = expectContract(UpdateStopResponseSchema, await updateRes.json(), 'PATCH /stops/:id');

    // Semantic: response echoes the new values and the formatted-response
    // invariants (useCount: 0 because controller hardcodes it on update).
    expect(updated.id).toBe(created.id);
    expect(updated.stopId).toBe(created.stopId);
    expect(updated.notes).toBe(newNotes);
    expect(updated.contactName).toBe(newContactName);
    expect(updated.appointmentRequired).toBe(true);
    expect(updated.useCount).toBe(0);

    // Persistence: GET /stops/:id reflects the patched values.
    const getRes = await asDispatcher.get(`/stops/${created.id}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(StopDetailSchema, await getRes.json());
    expect(detail.notes).toBe(newNotes);
    expect(detail.contactName).toBe(newContactName);
    expect(detail.appointmentRequired).toBe(true);
  });
});

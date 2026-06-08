/**
 * Fleet — Loads Activity Feed API (Phase 1 Group 7b)
 *
 * Covers one endpoint on `LoadsController`:
 *
 *   - GET /loads/:load_id/activity   → merged event + note feed
 *
 * Role rule (from `@Roles`): DISPATCHER, ADMIN, OWNER → `asDispatcher`
 * is sufficient. DRIVER is NOT permitted on this endpoint — the feed
 * surfaces dispatcher-visible side-channel data (status transitions,
 * reversal audit trail, internal notes) that is deliberately gated to
 * the back office.
 *
 * Response shape (see
 * `apps/backend/src/domains/fleet/loads/controllers/loads.controller.ts`
 * `getActivity`): a flat array of discriminated-union items keyed by
 * `type: 'event' | 'note'`. The service merges rows from
 * `LoadEventsService.getEvents(load.id)` and
 * `LoadNotesService.getNotes(load.id)`, then sorts **descending** by
 * `createdAt` (newest first) — verified in the controller's `.sort`
 * callback: `new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()`.
 *
 * Test fixture shape:
 *   1. `createAssignedLoad(asDispatcher, asAdmin)` — produces a load with
 *      at least `LOAD_CREATED` + `LOAD_ASSIGNED` events from the events
 *      service's internal emitters (creation + assign both log to
 *      `LoadEvent`).
 *   2. `POST /loads/:id/notes` via `buildLoadNote` — seeds one note so
 *      the merged feed has at least one of each item type.
 *
 * Schema strategy: hand-written discriminated union in
 * `packages/test-utils/src/schemas/load-subresources.ts`
 * (`LoadActivityItemSchema`) — no shared-types counterpart, this is a
 * controller-local projection.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLoadNote } from '@sally/test-utils/factories';
import { expectArrayContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { createAssignedLoad } from './_helpers.js';

const { LoadActivityItemSchema, LoadNoteSchema } = LoadSubresourceSchemas;

test.describe('Fleet · Loads Activity Feed @workflow', () => {
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

  test('GET /loads/:load_id/activity returns a merged event + note feed @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // ── Arrange: assigned load (→ at least LOAD_CREATED + LOAD_ASSIGNED
    // events) plus one seeded note so the union has both branches.
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const notePayload = buildLoadNote({
      content: 'QA activity feed smoke — dispatcher note',
      noteType: 'dispatch_update',
    });
    const noteRes = await asDispatcher.post(`/loads/${setup.loadId}/notes`, notePayload);
    expect(noteRes.status()).toBe(201);
    const createdNote = LoadNoteSchema.strict().parse(await noteRes.json());
    expect(createdNote.content).toBe(notePayload.content);
    expect(createdNote.noteType).toBe('dispatch_update');

    // ── Act
    const res = await asDispatcher.get(`/loads/${setup.loadId}/activity`);
    expect(res.status()).toBe(200);
    const items = expectArrayContract(LoadActivityItemSchema, await res.json(), { context: 'GET /loads/:id/activity' });

    // ── Assert: both branches present.
    const events = items.filter((item): item is Extract<typeof item, { type: 'event' }> => item.type === 'event');
    const notes = items.filter((item): item is Extract<typeof item, { type: 'note' }> => item.type === 'note');
    expect(events.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);

    // The seeded note we just created must appear — identify by content
    // (`id` on the note-item branch is the `LoadNote.id` FK, matching the
    // POST response).
    const seededNote = notes.find((n) => n.id === createdNote.id);
    expect(seededNote).toBeDefined();
    expect(seededNote?.content).toBe(notePayload.content);
    expect(seededNote?.noteType).toBe('dispatch_update');
    expect(seededNote?.isPinned).toBe(false);

    // At least one event should carry an `eventType` like LOAD_CREATED or
    // LOAD_ASSIGNED — don't pin the exact enum (backend adds new event
    // types over time), just assert the shape is populated.
    expect(events.every((e) => e.eventType.length > 0)).toBe(true);

    // ── Ordering: controller sorts descending by createdAt (newest first).
    // A strict monotonic non-increasing check tolerates ties produced by
    // sub-millisecond event bursts during assign (create-event + transition-
    // event can land in the same millisecond).
    const timestamps = items.map((i) => new Date(i.createdAt).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
    }

    // ── Persistence: unknown id → 404 (controller calls
    // `loadsService.findOne` first which throws NotFoundException).
    const missingRes = await asDispatcher.get('/loads/LOAD-does-not-exist/activity');
    expect(missingRes.status()).toBe(404);
  });
});

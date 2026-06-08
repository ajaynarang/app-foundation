/**
 * Fleet — Loads Notes API (Phase 1 Group 7a)
 *
 * Covers the note sub-resource endpoints on `LoadsController`:
 *
 *   - POST   /loads/:load_id/notes            → add a note
 *   - GET    /loads/:load_id/notes            → list notes (newest first)
 *   - PATCH  /loads/:load_id/notes/:note_id   → toggle the pinned flag
 *   - DELETE /loads/:load_id/notes/:note_id   → delete a note
 *
 * Role rules (from `@Roles` decorators, lines 890-949 of loads.controller.ts):
 *   - All four endpoints → DISPATCHER, ADMIN, OWNER. We use `asDispatcher`.
 *
 * Setup pattern: identical to loads-charges — every test uses
 * `createAssignedLoad(asDispatcher, asAdmin)` from `_helpers.ts`. `asAdmin`
 * is required because the helper provisions a driver via POST /drivers
 * (ADMIN-only) before assigning. Notes themselves do not depend on
 * assignment state, but using the same setup keeps cleanup uniform across
 * the loads sub-resource suite.
 *
 * Pin semantics: `LoadNotesService.pinNote` toggles the boolean — so a
 * "toggle twice" assertion proves both directions. The Prisma `LoadNote`
 * model has NO `pinnedAt` column (only `isPinned` + the auto `updatedAt`
 * that Prisma bumps on every update). See `load-notes.service.ts:35-47`
 * and `schema.prisma` lines 1863-1877.
 *
 * Schema: `LoadSubresourceSchemas.LoadNoteSchema` — mirrors the raw
 * Prisma `LoadNote` row returned by the service (NestJS serializes
 * Date → ISO string at the HTTP boundary). See
 * `packages/test-utils/src/schemas/load-subresources.ts`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLoadNote } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectArrayContract, expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import { createAssignedLoad } from './_helpers.js';

const { LoadNoteSchema } = LoadSubresourceSchemas;

test.describe('Fleet · Loads Notes @workflow', () => {
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

  // 1 ── POST /loads/:load_id/notes ──────────────────────────────────
  test('POST /loads/:load_id/notes creates a note scoped to the load and current user @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const payload = buildLoadNote({
      content: 'QA note — dispatcher handoff checklist complete',
      noteType: 'dispatch_update',
    });

    const res = await asDispatcher.post(`/loads/${setup.loadId}/notes`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LoadNoteSchema.strict(), await res.json(), 'POST /loads/:id/notes');

    // Semantic — echoed fields, defaults applied, scoped to the load.
    expect(body.loadId).toBe(setup.id);
    expect(body.content).toBe(payload.content);
    expect(body.noteType).toBe('dispatch_update');
    expect(body.isPinned).toBe(false);
    expect(body.userId).toBeGreaterThan(0);

    // Persistence — GET lists the newly-created note.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/notes`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadNoteSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/notes after POST',
    });
    expect(list.some((n) => n.id === body.id)).toBe(true);
  });

  // 2 ── GET /loads/:load_id/notes ───────────────────────────────────
  test('GET /loads/:load_id/notes returns notes in newest-first createdAt order @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    // Seed two notes so the ordering assertion is meaningful.
    const firstRes = await asDispatcher.post(
      `/loads/${setup.loadId}/notes`,
      buildLoadNote({ content: 'QA note 1', noteType: 'note' }),
    );
    expect(firstRes.status()).toBe(201);
    const first = expectContract(LoadNoteSchema.strict(), await firstRes.json());

    const secondRes = await asDispatcher.post(
      `/loads/${setup.loadId}/notes`,
      buildLoadNote({ content: 'QA note 2', noteType: 'dispatch_update' }),
    );
    expect(secondRes.status()).toBe(201);
    const second = expectContract(LoadNoteSchema.strict(), await secondRes.json());

    const res = await asDispatcher.get(`/loads/${setup.loadId}/notes`);
    expect(res.status()).toBe(200);
    const list = expectArrayContract(LoadNoteSchema.strict(), await res.json(), { context: 'GET /loads/:id/notes' });

    // Semantic — both seeded notes present, scoped to the load, and the
    // newer one appears before the older one (service orderBy is createdAt
    // desc).
    expect(list.length).toBeGreaterThanOrEqual(2);
    const firstIdx = list.findIndex((n) => n.id === first.id);
    const secondIdx = list.findIndex((n) => n.id === second.id);
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeLessThan(firstIdx);
    for (const note of list) {
      expect(note.loadId).toBe(setup.id);
    }
  });

  // 3 ── PATCH /loads/:load_id/notes/:note_id ────────────────────────
  test('PATCH /loads/:load_id/notes/:note_id toggles the isPinned flag on each call @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const seedRes = await asDispatcher.post(
      `/loads/${setup.loadId}/notes`,
      buildLoadNote({ content: 'QA pin-me note', noteType: 'note' }),
    );
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(LoadNoteSchema.strict(), await seedRes.json());
    expect(seed.isPinned).toBe(false);

    // First toggle — flips to pinned.
    const pinRes = await asDispatcher.patch(`/loads/${setup.loadId}/notes/${seed.id}`, {});
    expect(pinRes.status()).toBe(200);
    const pinned = expectContract(LoadNoteSchema.strict(), await pinRes.json(), 'PATCH /loads/:id/notes/:nid (pin)');
    expect(pinned.id).toBe(seed.id);
    expect(pinned.loadId).toBe(setup.id);
    expect(pinned.isPinned).toBe(true);
    expect(pinned.content).toBe(seed.content);

    // Persistence — GET reflects the pinned flag.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/notes`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadNoteSchema.strict(), await listRes.json());
    const persisted = list.find((n) => n.id === seed.id);
    expect(persisted?.isPinned).toBe(true);

    // Second toggle — flips back to unpinned. Proves the endpoint is a
    // true toggle, not a one-shot pin.
    const unpinRes = await asDispatcher.patch(`/loads/${setup.loadId}/notes/${seed.id}`, {});
    expect(unpinRes.status()).toBe(200);
    const unpinned = expectContract(
      LoadNoteSchema.strict(),
      await unpinRes.json(),
      'PATCH /loads/:id/notes/:nid (unpin)',
    );
    expect(unpinned.isPinned).toBe(false);
  });

  // 4 ── DELETE /loads/:load_id/notes/:note_id ───────────────────────
  test('DELETE /loads/:load_id/notes/:note_id removes the note from the load @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const seedRes = await asDispatcher.post(
      `/loads/${setup.loadId}/notes`,
      buildLoadNote({ content: 'QA delete-me note', noteType: 'note' }),
    );
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(LoadNoteSchema.strict(), await seedRes.json());

    const delRes = await asDispatcher.delete(`/loads/${setup.loadId}/notes/${seed.id}`);
    // DELETE returns the deleted Prisma row. Assert the status; the body
    // shape is not part of this test's contract (no schema lock on the
    // delete payload).
    expect(delRes.status()).toBe(200);

    // Persistence — the note is absent from the subsequent list read, and
    // a second delete surfaces the controller's "not on this load" 404
    // guard (line 945-947 of loads.controller.ts).
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/notes`);
    expect(listRes.status()).toBe(200);
    const listBody = (await listRes.json()) as Array<{ id: number }>;
    expect(Array.isArray(listBody)).toBe(true);
    expect(listBody.some((n) => n.id === seed.id)).toBe(false);

    const secondDelRes = await asDispatcher.delete(`/loads/${setup.loadId}/notes/${seed.id}`);
    expect(secondDelRes.status()).toBe(404);
  });
});

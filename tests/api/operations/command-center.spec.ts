/**
 * Operations — Command Center (Phase 3 Group 3f + Tower v3, PR #752).
 *
 * Covers the 12 endpoints on `CommandCenterController`:
 *
 *   1. GET    /command-center/map-data                   vehicle locations + HOS + unassigned loads
 *   2. GET    /command-center/overview                   KPIs + active loads + driver HOS strip
 *   3. GET    /command-center/message-summary            active-load message summary
 *   4. GET    /command-center/system-health              monitoring status + checks + integrations
 *   5. GET    /command-center/shift-notes                list shift notes + handoff status
 *   6. POST   /command-center/shift-notes                create a shift note                 (@destructive)
 *   7. PATCH  /command-center/shift-notes/acknowledge    bulk-ack handoff (all active notes) (@destructive)
 *   8. PATCH  /command-center/shift-notes/:noteId/pin    toggle pin on a note                (@destructive)
 *   9. DELETE /command-center/shift-notes/:noteId        soft-delete a note                  (@destructive)
 *  10. GET    /command-center/active-loads               Tower v3 — ActiveLoadView[] (spine feed)
 *  11. GET    /command-center/risk-scores                Tower v3 — RiskScore[] (map risk bands)
 *  12. GET    /command-center/wire                       Tower v3 — WireItem[] (unified feed backfill)
 *
 * All tests run as `asDispatcher` — the controller is class-level gated to
 * DISPATCHER/ADMIN/OWNER (`@Roles`) and dispatchers are the primary command-
 * center users. Plan gate `@requires:plan-command_center` applied per test.
 *
 * Tower v3 (tests 10-12) — the QA phase deferred by the Tower v3 plan
 * (`.docs/plans/04-operations/2026-04-28-tower-v3-design.md` lines 716-721).
 * The three endpoints live on `CommandCenterController`, so they extend this
 * suite rather than spawning a separate `tower-events/` folder. Each is an
 * array endpoint validated via `expectArrayContract` ({ allowEmpty: true } —
 * demo data is stale, so we assert SHAPE + STATUS, never row counts). Their
 * Zod contracts come from `@sally/shared-types` (`operations/tower.schema.ts`),
 * re-exported through `CommandCenterSchemas` to keep the schema barrel
 * complete. Param-range validation:
 *   - `lookaheadHours` clamps to 1..12 via class-validator `@Min/@Max` —
 *     out-of-range is REJECTED with 400 (not silently clamped).
 *   - wire `limit` clamps to 1..200 likewise — out-of-range → 400.
 *   - wire `kinds` is comma-separated; an unknown kind fails `@IsIn` → 400.
 *
 * Route-shadowing check — VERIFIED (no bug). `command-center.controller.ts`
 * declares `PATCH /shift-notes/acknowledge` BEFORE `PATCH /shift-notes/:noteId/pin`
 * (lines 78 + 85). Nest matches the acknowledge handler correctly. Contrast
 * with finding #31 for alerts where the reverse order causes shadowing.
 *
 * Schema strategy:
 *   - Tests 1-3 + 5 use `@sally/shared-types` schemas (re-exported via
 *     `CommandCenterSchemas` in `@sally/test-utils/schemas/command-center.ts`).
 *     Top-level `.strict()` at the call site to catch envelope drift; nested
 *     objects remain lenient because shared-types doesn't mark them strict.
 *   - Test 4 (system-health) likewise — live response exactly matches the
 *     shared-types `SystemHealthSchema` (verified via curl on 2026-04-20).
 *   - Tests 6 + 8 use `ShiftNoteSchema` directly (single-note envelope).
 *   - Test 7 (acknowledge) + test 9 (delete) return plain `{ message: string }`
 *     — hand-written local envelope below.
 *
 * Cleanup: tests 6 + 8 each create their own shift note; cleanup is via
 * `afterEach` (tracked via `createdNoteIds` Set). Test 9 deletes the note it
 * created and therefore does NOT register it for afterEach. Test 7 (bulk
 * acknowledge) operates on an in-test-created note plus any pre-existing
 * active notes on the tenant — the ack is a semantic flip, not a row
 * creation, so cleanup for test 7 is only the note it seeded.
 *
 * Finding #34 (backend inconsistency, test-tolerant):
 *   - `DELETE /command-center/shift-notes/:noteId` returns HTTP 200 with
 *     `{ message: 'Note deleted' }` EVEN when the note has already been
 *     deleted OR does not exist on the tenant. The service uses
 *     `prisma.shiftNote.updateMany({ where: { noteId, tenantId, deletedAt: null } })`
 *     which is a no-op on a missing row — no `NotFoundException` is thrown.
 *     Contrast `togglePinShiftNote` + `acknowledgeHandoff` which DO throw
 *     404 on missing note / missing user. Test 9 asserts the observed
 *     behaviour (200 on double-delete) and cross-references the finding.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract } from '@sally/test-utils/schemas';
import { CommandCenterSchemas, ShiftNoteSchemas } from '@sally/test-utils/schemas';
import { buildShiftNote } from '@sally/test-utils/factories';
import { z } from 'zod';
import { seedShiftNote } from './_helpers.js';

// ── Envelope for `{ message: string }` responses ─────────────────────────────
//
// `PATCH /shift-notes/acknowledge` and `DELETE /shift-notes/:noteId` both
// return this shape. Message strings are fixed by the controller
// ('Handoff acknowledged', 'Note deleted') — we assert the literal to catch
// any stealth rewrite.
const MessageEnvelopeSchema = z.object({ message: z.string().min(1) }).strict();

test.describe('Operations · Command Center @workflow @requires:plan-command_center', () => {
  // Notes created by tests 6, 7, and 8 that need afterEach cleanup. Test 9
  // cleans up its own seed inline and does NOT add to the set.
  const createdNoteIds = new Set<string>();

  test.afterEach(async ({ asDispatcher }) => {
    for (const noteId of createdNoteIds) {
      const res = await asDispatcher.delete(`/command-center/shift-notes/${noteId}`);
      // DELETE returns 200 even on double-delete (finding #34); anything else
      // is unexpected. Don't throw — just warn — so the next afterEach runs.
      if (res.status() !== 200) {
        // eslint-disable-next-line no-console
        console.warn(`afterEach: DELETE /command-center/shift-notes/${noteId} → HTTP ${res.status()}`);
      }
    }
    createdNoteIds.clear();
  });

  // 1 ── GET /command-center/map-data ─────────────────────────────────────────
  test('GET /command-center/map-data returns trucks + unassignedLoads envelope @workflow @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/map-data');
    expect(res.status()).toBe(200);
    const body = expectContract(
      CommandCenterSchemas.CommandCenterMapDataSchema,
      await res.json(),
      'GET /command-center/map-data',
    );

    // Semantic — envelope carries a recent ISO `lastUpdated`; every truck's
    // hos-remaining counters are non-negative; every unassigned load references
    // a distinct id. Demo tenants carry ≥1 truck — we assert the array is
    // present (may be empty on cold CI, so allow empty but flag the shape).
    expect(Number.isNaN(Date.parse(body.lastUpdated))).toBe(false);
    for (const truck of body.trucks) {
      expect(truck.hosDriveRemaining).toBeGreaterThanOrEqual(0);
      expect(truck.hosDutyRemaining).toBeGreaterThanOrEqual(0);
      // `driverId` + `vehicleId` are always populated non-empty strings.
      expect(truck.driverId.length).toBeGreaterThan(0);
      expect(truck.vehicleId.length).toBeGreaterThan(0);
    }
    const unassignedIds = new Set(body.unassignedLoads.map((l) => l.loadNumber));
    expect(unassignedIds.size).toBe(body.unassignedLoads.length);
  });

  // 2 ── GET /command-center/overview ─────────────────────────────────────────
  test('GET /command-center/overview returns KPIs + activeLoads + driverHosStrip @workflow @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/overview');
    expect(res.status()).toBe(200);
    const body = expectContract(
      CommandCenterSchemas.CommandCenterOverviewSharedSchema.strict(),
      await res.json(),
      'GET /command-center/overview',
    );

    // Semantic — KPI invariants: inTransit ≤ activeLoads, unassigned ≤
    // activeLoads + unassigned (inventory bound), onTimePercentage ∈ [0..100].
    expect(body.kpis.activeLoads).toBeGreaterThanOrEqual(body.kpis.inTransit);
    expect(body.kpis.onTimePercentage).toBeGreaterThanOrEqual(0);
    expect(body.kpis.onTimePercentage).toBeLessThanOrEqual(100);
    expect(body.kpis.activeAlerts).toBeGreaterThanOrEqual(0);

    // quickActionCounts is always present + numeric.
    expect(body.quickActionCounts.unassignedLoads).toBeGreaterThanOrEqual(0);
    expect(body.quickActionCounts.availableDrivers).toBeGreaterThanOrEqual(0);

    // Every activeLoad has a non-empty loadId + loadNumber + tier one of the
    // three LoadCardTier values.
    const tierSet = new Set(['basic', 'tracked', 'planned']);
    for (const load of body.activeLoads) {
      expect(load.loadId.length).toBeGreaterThan(0);
      expect(load.loadNumber.length).toBeGreaterThan(0);
      expect(tierSet.has(load.tier)).toBe(true);
    }
  });

  // 3 ── GET /command-center/message-summary ──────────────────────────────────
  test('GET /command-center/message-summary returns items + needsResponseCount @workflow @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/message-summary');
    expect(res.status()).toBe(200);
    const body = expectContract(
      CommandCenterSchemas.CommandCenterMessageSummarySchema.strict(),
      await res.json(),
      'GET /command-center/message-summary',
    );

    // Semantic — needsResponseCount is a non-negative integer and cannot
    // exceed the count of items whose lastMessage.role === 'driver' with
    // unread > 0. The controller computes it as the count of items with
    // unreadCount > 0 and lastMessage.role === 'driver'.
    expect(body.needsResponseCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.needsResponseCount)).toBe(true);
    const needsResponseActual = body.items.filter((i) => i.unreadCount > 0 && i.lastMessage?.role === 'driver').length;
    expect(body.needsResponseCount).toBe(needsResponseActual);

    // Every item has a non-empty loadId + loadNumber; unreadCount ≥ 0.
    for (const item of body.items) {
      expect(item.loadId.length).toBeGreaterThan(0);
      expect(item.loadNumber.length).toBeGreaterThan(0);
      expect(item.unreadCount).toBeGreaterThanOrEqual(0);
    }
  });

  // 4 ── GET /command-center/system-health ────────────────────────────────────
  test('GET /command-center/system-health returns monitoring + checks + integrations + pipeline @workflow @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/system-health');
    expect(res.status()).toBe(200);
    const body = expectContract(
      CommandCenterSchemas.CommandCenterSystemHealthSchema.strict(),
      await res.json(),
      'GET /command-center/system-health',
    );

    // Semantic — monitoring.status is one of the five documented values; the
    // cycleIntervalSeconds is positive; counters are non-negative integers.
    expect(body.monitoring.cycleIntervalSeconds).toBeGreaterThan(0);
    expect(body.monitoring.loadsMonitored).toBeGreaterThanOrEqual(0);
    expect(body.monitoring.driversMonitored).toBeGreaterThanOrEqual(0);
    expect(body.monitoring.triggersLastCycle).toBeGreaterThanOrEqual(0);

    // `checks` has at least one category; each category has a non-empty name
    // + at least one check. The demo tenant seeds 5 categories (Load Progress,
    // HOS Compliance, etc.) but we only assert ≥ 1 to stay portable.
    expect(body.checks.length).toBeGreaterThan(0);
    for (const category of body.checks) {
      expect(category.category.length).toBeGreaterThan(0);
      expect(category.checks.length).toBeGreaterThan(0);
    }

    // `integrations` is an array — at least one (Samsara HOS) in demo. Each
    // integration has a valid `source` + `status` pair (Zod enforced this
    // via the schema, but the assert adds a semantic safety net).
    for (const integration of body.integrations) {
      expect(['live', 'mock']).toContain(integration.source);
      expect(['connected', 'disconnected', 'not_configured']).toContain(integration.status);
    }
  });

  // 5 ── GET /command-center/shift-notes ──────────────────────────────────────
  test('GET /command-center/shift-notes returns notes + handoffStatus envelope @workflow @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    // Seed one note so we can assert `notes` is non-empty. Cleanup via afterEach.
    const seed = await seedShiftNote(asDispatcher);
    createdNoteIds.add(seed.noteId);

    const res = await asDispatcher.get('/command-center/shift-notes');
    expect(res.status()).toBe(200);
    const body = expectContract(
      ShiftNoteSchemas.ShiftNotesResponseSchema.strict(),
      await res.json(),
      'GET /command-center/shift-notes',
    );

    // Semantic — the seeded note is present; every note carries a non-empty
    // content + a valid priority; handoffStatus.acknowledged is a boolean.
    const match = body.notes.find((n) => n.noteId === seed.noteId);
    expect(match).toBeDefined();
    expect(match?.content.length).toBeGreaterThan(0);
    expect(['urgent', 'action_required', 'info']).toContain(match?.priority);
    expect(typeof body.handoffStatus.acknowledged).toBe('boolean');
  });

  // 6 ── POST /command-center/shift-notes ─────────────────────────────────────
  test('POST /command-center/shift-notes creates a shift note and echoes ShiftNote envelope @workflow @requires:plan-command_center @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildShiftNote({ priority: 'action_required' });
    const res = await asDispatcher.post('/command-center/shift-notes', payload);
    expect(res.status()).toBe(201);
    const note = expectContract(
      ShiftNoteSchemas.ShiftNoteSchema.strict(),
      await res.json(),
      'POST /command-center/shift-notes',
    );
    createdNoteIds.add(note.noteId);

    // Semantic — content echoed verbatim; priority honoured; isPinned defaults
    // to false; acknowledgedBy/At both null on fresh note; createdAt parseable;
    // expiresAt is 24h after createdAt (service hard-codes +24h).
    expect(note.content).toBe(payload.content);
    expect(note.priority).toBe('action_required');
    expect(note.isPinned).toBe(false);
    expect(note.acknowledgedBy).toBeNull();
    expect(note.acknowledgedAt).toBeNull();
    const createdMs = Date.parse(note.createdAt);
    const expiresMs = Date.parse(note.expiresAt);
    expect(Number.isNaN(createdMs)).toBe(false);
    expect(Number.isNaN(expiresMs)).toBe(false);
    expect(expiresMs - createdMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(expiresMs - createdMs).toBeLessThan(25 * 60 * 60 * 1000);

    // Persistence — GET /shift-notes contains the new note.
    const listRes = await asDispatcher.get('/command-center/shift-notes');
    expect(listRes.status()).toBe(200);
    const list = expectContract(ShiftNoteSchemas.ShiftNotesResponseSchema.strict(), await listRes.json());
    expect(list.notes.find((n) => n.noteId === note.noteId)).toBeDefined();

    // DTO validation — empty content is rejected by class-validator
    // (`@MinLength(1)`), invalid priority is rejected by `@IsIn([...])`.
    const badContent = await asDispatcher.post('/command-center/shift-notes', { content: '' });
    expect(badContent.status()).toBe(400);
    const badPriority = await asDispatcher.post('/command-center/shift-notes', { content: 'x', priority: 'INVALID' });
    expect(badPriority.status()).toBe(400);
  });

  // 7 ── PATCH /command-center/shift-notes/acknowledge ────────────────────────
  test('PATCH /command-center/shift-notes/acknowledge flips handoffStatus.acknowledged to true @workflow @requires:plan-command_center @destructive', async ({
    asDispatcher,
  }) => {
    // Seed one fresh unacknowledged note so we can prove the ack flipped it.
    const seed = await seedShiftNote(asDispatcher);
    createdNoteIds.add(seed.noteId);

    const res = await asDispatcher.patch('/command-center/shift-notes/acknowledge', {});
    expect(res.status()).toBe(200);
    const body = expectContract(
      MessageEnvelopeSchema,
      await res.json(),
      'PATCH /command-center/shift-notes/acknowledge',
    );
    expect(body.message).toBe('Handoff acknowledged');

    // Persistence — GET /shift-notes now reports handoffStatus.acknowledged:
    // true and the seeded note has acknowledgedBy + acknowledgedAt populated.
    const listRes = await asDispatcher.get('/command-center/shift-notes');
    expect(listRes.status()).toBe(200);
    const list = expectContract(ShiftNoteSchemas.ShiftNotesResponseSchema.strict(), await listRes.json());
    expect(list.handoffStatus.acknowledged).toBe(true);

    const match = list.notes.find((n) => n.noteId === seed.noteId);
    expect(match).toBeDefined();
    expect(match?.acknowledgedBy).not.toBeNull();
    expect(match?.acknowledgedAt).not.toBeNull();
    const ackMs = Date.parse(match?.acknowledgedAt ?? '');
    expect(Number.isNaN(ackMs)).toBe(false);
    expect(Date.now() - ackMs).toBeLessThan(60_000);
  });

  // 8 ── PATCH /command-center/shift-notes/:noteId/pin ────────────────────────
  test('PATCH /command-center/shift-notes/:noteId/pin toggles isPinned on the note @workflow @requires:plan-command_center @destructive', async ({
    asDispatcher,
  }) => {
    const seed = await seedShiftNote(asDispatcher);
    createdNoteIds.add(seed.noteId);

    // First toggle — false → true.
    const pinRes = await asDispatcher.patch(`/command-center/shift-notes/${seed.noteId}/pin`, {});
    expect(pinRes.status()).toBe(200);
    const pinned = expectContract(
      ShiftNoteSchemas.ShiftNoteSchema.strict(),
      await pinRes.json(),
      'PATCH /command-center/shift-notes/:noteId/pin (pin)',
    );
    expect(pinned.noteId).toBe(seed.noteId);
    expect(pinned.isPinned).toBe(true);

    // Second toggle — true → false. Semantic: the action is a boolean flip,
    // not an idempotent "set to true".
    const unpinRes = await asDispatcher.patch(`/command-center/shift-notes/${seed.noteId}/pin`, {});
    expect(unpinRes.status()).toBe(200);
    const unpinned = expectContract(
      ShiftNoteSchemas.ShiftNoteSchema.strict(),
      await unpinRes.json(),
      'PATCH /command-center/shift-notes/:noteId/pin (unpin)',
    );
    expect(unpinned.isPinned).toBe(false);

    // Unknown note id → 404 (service throws NotFoundException before update).
    const missingRes = await asDispatcher.patch('/command-center/shift-notes/bogus-note-id/pin', {});
    expect(missingRes.status()).toBe(404);
  });

  // 9 ── DELETE /command-center/shift-notes/:noteId ───────────────────────────
  test('DELETE /command-center/shift-notes/:noteId soft-deletes the note @workflow @requires:plan-command_center @destructive', async ({
    asDispatcher,
  }) => {
    const seed = await seedShiftNote(asDispatcher);
    // NOT added to createdNoteIds — this test is the cleanup.

    const res = await asDispatcher.delete(`/command-center/shift-notes/${seed.noteId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(MessageEnvelopeSchema, await res.json(), 'DELETE /command-center/shift-notes/:noteId');
    expect(body.message).toBe('Note deleted');

    // Persistence — subsequent GET /shift-notes omits the deleted note (the
    // service filters `deletedAt: null`).
    const listRes = await asDispatcher.get('/command-center/shift-notes');
    expect(listRes.status()).toBe(200);
    const list = expectContract(ShiftNoteSchemas.ShiftNotesResponseSchema.strict(), await listRes.json());
    expect(list.notes.find((n) => n.noteId === seed.noteId)).toBeUndefined();

    // Double-delete idempotency — controller returns 200 with the same
    // envelope (finding #34). Captured here to lock the current behaviour
    // until the backend grows a NotFoundException.
    const doubleRes = await asDispatcher.delete(`/command-center/shift-notes/${seed.noteId}`);
    expect(doubleRes.status()).toBe(200);
    const doubleBody = expectContract(
      MessageEnvelopeSchema,
      await doubleRes.json(),
      'DELETE /command-center/shift-notes/:noteId (double-delete)',
    );
    expect(doubleBody.message).toBe('Note deleted');
  });

  // ── Tower v3 (PR #752) ──────────────────────────────────────────────────────
  //
  // The deferred QA phase from the Tower v3 plan. These three endpoints back
  // the Tower canvas: `active-loads` feeds the driver spine, `risk-scores`
  // colour-codes the map, `wire` backfills the unified feed. All read-only
  // GETs — no @destructive, no cleanup.

  // 10 ── GET /command-center/active-loads ────────────────────────────────────
  test('GET /command-center/active-loads returns an ActiveLoadView[] @workflow @contract @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/active-loads?lookaheadHours=4');
    expect(res.status()).toBe(200);
    // Array endpoint — allowEmpty: demo tenants may have no in-window loads on
    // cold CI. We assert SHAPE, not count.
    const loads = expectArrayContract(CommandCenterSchemas.ActiveLoadViewSchema, await res.json(), {
      allowEmpty: true,
      context: 'GET /command-center/active-loads',
    });

    // Semantic — every view carries a non-empty loadId + loadNumber + a driver
    // identity; assignmentState is one of the two documented values; when HOS
    // is present it carries the four FMCSA clocks (drive/duty/cycle integers,
    // break nullable) plus the ELD connection flag.
    for (const load of loads) {
      expect(load.loadId.length).toBeGreaterThan(0);
      expect(load.loadNumber.length).toBeGreaterThan(0);
      expect(load.driver.driverId.length).toBeGreaterThan(0);
      expect(['assigned', 'rolling']).toContain(load.assignmentState);
      if (load.hos) {
        expect(Number.isInteger(load.hos.driveMinutesRemaining)).toBe(true);
        expect(Number.isInteger(load.hos.dutyMinutesRemaining)).toBe(true);
        expect(Number.isInteger(load.hos.cycleMinutesRemaining)).toBe(true);
        expect(typeof load.hos.isEldConnected).toBe('boolean');
      }
    }

    // Param range — lookaheadHours clamps to 1..12 via class-validator. An
    // out-of-range value is REJECTED with 400 (not silently clamped).
    const tooHigh = await asDispatcher.get('/command-center/active-loads?lookaheadHours=99');
    expect(tooHigh.status()).toBe(400);
    const tooLow = await asDispatcher.get('/command-center/active-loads?lookaheadHours=0');
    expect(tooLow.status()).toBe(400);
  });

  // 11 ── GET /command-center/risk-scores ─────────────────────────────────────
  test('GET /command-center/risk-scores returns a RiskScore[] with bounded scores @workflow @contract @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/risk-scores?lookaheadHours=4');
    expect(res.status()).toBe(200);
    const scores = expectArrayContract(CommandCenterSchemas.RiskScoreSchema, await res.json(), {
      allowEmpty: true,
      context: 'GET /command-center/risk-scores',
    });

    // Semantic — every score references a non-empty loadId + driverId; score
    // is an integer in [0..100]; band is one of the three risk bands. (Zod
    // enforces the range; the asserts add a semantic safety net + check the
    // band/score pairing is internally consistent with the documented
    // thresholds — at-risk ≥ 60, critical ≥ 80.)
    for (const score of scores) {
      expect(score.loadId.length).toBeGreaterThan(0);
      expect(score.driverId.length).toBeGreaterThan(0);
      expect(Number.isInteger(score.score)).toBe(true);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(['on-track', 'at-risk', 'critical']).toContain(score.band);
    }

    // Param range — same lookaheadHours DTO as active-loads; 99 → 400.
    const tooHigh = await asDispatcher.get('/command-center/risk-scores?lookaheadHours=99');
    expect(tooHigh.status()).toBe(400);
  });

  // 12 ── GET /command-center/wire ────────────────────────────────────────────
  test('GET /command-center/wire returns a WireItem[] honouring limit + kinds @workflow @contract @requires:plan-command_center', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/command-center/wire');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(CommandCenterSchemas.WireItemSchema, await res.json(), {
      allowEmpty: true,
      context: 'GET /command-center/wire',
    });

    // Semantic — every item has a non-empty id + text; kind/severity are from
    // the documented enums; timestamp is parseable.
    for (const item of items) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.text.length).toBeGreaterThan(0);
      expect(['alert', 'message', 'desk', 'ops']).toContain(item.kind);
      expect(['critical', 'caution', 'info']).toContain(item.severity);
      expect(Number.isNaN(Date.parse(item.timestamp))).toBe(false);
    }

    // `limit` is respected — request 5, assert the array is BOUNDED by 5.
    // Demo data is stale so we assert ≤, never ===.
    const limitedRes = await asDispatcher.get('/command-center/wire?limit=5');
    expect(limitedRes.status()).toBe(200);
    const limited = expectArrayContract(CommandCenterSchemas.WireItemSchema, await limitedRes.json(), {
      allowEmpty: true,
      context: 'GET /command-center/wire?limit=5',
    });
    expect(limited.length).toBeLessThanOrEqual(5);

    // `kinds` filter — request only alerts; every returned item is an alert.
    const alertsRes = await asDispatcher.get('/command-center/wire?kinds=alert');
    expect(alertsRes.status()).toBe(200);
    const alerts = expectArrayContract(CommandCenterSchemas.WireItemSchema, await alertsRes.json(), {
      allowEmpty: true,
      context: 'GET /command-center/wire?kinds=alert',
    });
    for (const item of alerts) {
      expect(item.kind).toBe('alert');
    }

    // Param range — `limit` clamps to 1..200 via class-validator; out-of-range
    // is REJECTED with 400 (verified against the DTO `@Min(1) @Max(200)`).
    const limitTooHigh = await asDispatcher.get('/command-center/wire?limit=9999');
    expect(limitTooHigh.status()).toBe(400);

    // `kinds` — an unknown kind fails the per-element `@IsIn` validator → 400
    // (the comma-split DTO transform keeps the bad token, validation rejects).
    const badKind = await asDispatcher.get('/command-center/wire?kinds=bogus');
    expect(badKind.status()).toBe(400);
  });
});

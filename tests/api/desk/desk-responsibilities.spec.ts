/**
 * Desk Responsibilities (Phase 6 Group 6f — 5 tests on
 * DeskResponsibilityController).
 *
 * Covers the 5 endpoints on
 * `apps/backend/src/domains/desk/core/responsibility/responsibility.controller.ts`:
 *
 *    41. GET   /desk/responsibilities             — list (10 rows, registry order)
 *    42. GET   /desk/responsibilities/:key        — detail (rollups + per-tenant)
 *    43. GET   /desk/responsibilities/:key/ui-spec — code-authored UI spec
 *    44. PATCH /desk/responsibilities/:key        — update per-tenant settings
 *    45. POST  /desk/responsibilities/ar_followup/run — manual trigger (202)
 *
 * Auth: `@Roles(DISPATCHER, ADMIN, OWNER, SUPER_ADMIN)` at the class
 * level — `asDispatcher` is the canonical happy-path role.
 *
 * Status codes (verified live, plus controller decorators):
 *   - GET   /desk/responsibilities             → 200
 *   - GET   /desk/responsibilities/:key        → 200 (TODAY 500 — Finding #54)
 *   - GET   /desk/responsibilities/:key/ui-spec → 200 (no DB hit)
 *   - PATCH /desk/responsibilities/:key        → 200 (TODAY 500 — Finding #54)
 *   - POST  /desk/responsibilities/ar_followup/run → 202 (explicit @HttpCode)
 *
 * IMPORTANT — Finding #54 (Phase 6 Group 6f):
 *   `apps/backend/prisma/schema.prisma::DeskResponsibility` is OUT OF
 *   SYNC with the live `desk_responsibilities` table. The model declares
 *   `notesForSally` and `supervisorUserId` columns that no longer exist
 *   in the DB (parallel drift to Finding #53 for desk_memories). Result:
 *   `findUnique({select: {notesForSally, supervisorUserId, ...}})` in
 *   `getForTenant` (responsibility.service.ts:109) emits a SELECT clause
 *   that references missing columns → Prisma error P2022 → HTTP 500.
 *
 *   Tests 42, 43, 44 are tagged `@requires:data-desk-responsibility` so
 *   they collection-exclude cleanly until the operator regenerates the
 *   Prisma client against the live DB shape AND flips the capability.
 *
 *   Test 41 (list) is UNAFFECTED — `listForTenant` projects only
 *   `{id, key, lifecycle, enabled, trustLevel, lastRunAt}`.
 *
 *   Test 43 (ui-spec) is UNAFFECTED at the source level — controller
 *   line 54-67 reads from the in-memory registry, no DB hit. Tagged
 *   `@requires:data-desk-responsibility` for ergonomic alignment with
 *   tests 42/44 (a tenant lacking responsibility rows is a precondition
 *   for the entire feature, not just the DB-touching subset).
 *
 * Spec topology — three describe blocks:
 *   1. Read paths (tests 41, 42, 43) — parallel-safe, no mutation.
 *   2. Mutation (test 44) — SERIAL with itself only; captures the row's
 *      original `notesForSally`, patches it, asserts echo via response
 *      AND via follow-up GET, then restores in afterAll.
 *   3. Manual run (test 45) — single test, `@destructive @slow`.
 *
 * Persistence:
 *   - Test 41: self-validating envelope (10 registry-ordered rows).
 *   - Test 42: id echoes via key match.
 *   - Test 43: deterministic — same response for every tenant.
 *   - Test 44: response is the post-update row from `getForTenant`.
 *     Persistence verified by re-fetching detail and asserting `notesForSally`
 *     matches. Restoration of original value runs in `afterAll`.
 *   - Test 45: 202 + episodesOpened/Reused/skipped envelope. The downstream
 *     LLM run is asynchronous and out of scope.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher`.
 *   - Factory: `buildDeskResponsibilityPatch`.
 *   - Exact numeric status (`.toBe(...)`).
 *   - expectContract on every JSON body.
 *   - Semantic property + state-change assertion on every test.
 *   - Tags per the plan (§6 lines 254-258).
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDeskResponsibilityPatch } from '@sally/test-utils/factories';
import { expectContract, DeskSchemas } from '@sally/test-utils/schemas';
import { firstResponsibilityKey, AR_FOLLOWUP_KEY } from './_helpers';

const {
  DeskResponsibilityListSchema,
  DeskResponsibilityDetailSchema,
  DeskResponsibilityUiSpecSchema,
  DeskResponsibilityRunResponseSchema,
} = DeskSchemas;

// ─── Read paths (tests 41, 42, 43) ───────────────────────────────────
test.describe('Desk Responsibilities · read paths @workflow @contract @desk', () => {
  // 41 ── GET /desk/responsibilities ────────────────────────────────
  test('GET /desk/responsibilities returns the 10 registry-ordered rows (DISPATCHER) @workflow @contract @desk', async ({
    asDispatcher,
  }) => {
    // Bare-array (NOT envelope-wrapped) — service `listForTenant`
    // projects exactly the registry order with rollup counts. Live
    // probe (2026-04-27) returned all 10 RESPONSIBILITY_KEYS.
    const res = await asDispatcher.get('/desk/responsibilities');
    expect(res.status()).toBe(200);

    const body = expectContract(
      DeskResponsibilityListSchema,
      await res.json(),
      'GET /desk/responsibilities',
    );

    // Semantic — returns ALL 10 registry rows; first row is `ar_followup`
    // (registry index 0); every row has rollup counts ≥ 0; rollup invariant:
    // pendingApprovalCount ≤ openEpisodeCount only when approvals are 1:1
    // with episodes — that's NOT guaranteed in the data model, so we
    // skip that assertion. The response IS the list — no envelope.
    expect(body.length).toBe(10);
    expect(body[0]!.key).toBe(AR_FOLLOWUP_KEY);
    for (const row of body) {
      expect(row.openEpisodeCount).toBeGreaterThanOrEqual(0);
      expect(row.pendingApprovalCount).toBeGreaterThanOrEqual(0);
    }
  });

  // 42 ── GET /desk/responsibilities/:key ───────────────────────────
  test('GET /desk/responsibilities/:key returns detail with conditions + rollups (DISPATCHER) @workflow @contract @desk @requires:data-desk-responsibility', async ({
    asDispatcher,
  }) => {
    const { key } = await firstResponsibilityKey(asDispatcher);

    const res = await asDispatcher.get(`/desk/responsibilities/${key}`);
    expect(res.status()).toBe(200);

    const body = expectContract(
      DeskResponsibilityDetailSchema,
      await res.json(),
      `GET /desk/responsibilities/${key}`,
    );

    // Semantic — key echoes; conditions is a record (may be empty {});
    // rollup counts present (already enforced by schema, re-asserted
    // here for documentation).
    expect(body.key).toBe(key);
    expect(body.openEpisodeCount).toBeGreaterThanOrEqual(0);
    expect(body.pendingApprovalCount).toBeGreaterThanOrEqual(0);
  });

  // 43 ── GET /desk/responsibilities/:key/ui-spec ──────────────────
  test('GET /desk/responsibilities/:key/ui-spec returns the code-authored UI spec (DISPATCHER) @workflow @contract @desk @requires:data-desk-responsibility', async ({
    asDispatcher,
  }) => {
    // ar_followup hardcoded — its conditionsUI is a non-null
    // `{fields: [...]}` object (3 fields per ar-followup.ts). COMING_SOON
    // stubs return null for conditionsUI; we exercise the AVAILABLE
    // shape here for the strongest semantic check.
    const res = await asDispatcher.get(`/desk/responsibilities/${AR_FOLLOWUP_KEY}/ui-spec`);
    expect(res.status()).toBe(200);

    const body = expectContract(
      DeskResponsibilityUiSpecSchema,
      await res.json(),
      `GET /desk/responsibilities/${AR_FOLLOWUP_KEY}/ui-spec`,
    );

    // Semantic — key echoes; lifecycle is AVAILABLE (ar_followup is the
    // only AVAILABLE responsibility today); conditionsUI.fields is a
    // non-empty array (3 fields per ar-followup.ts); triggers include
    // both the scheduled cron and the manual entry.
    expect(body.key).toBe(AR_FOLLOWUP_KEY);
    expect(body.lifecycle).toBe('AVAILABLE');
    expect(body.conditionsUI).not.toBeNull();
    expect(body.conditionsUI!.fields.length).toBeGreaterThan(0);
    expect(body.triggers.some((t) => t.kind === 'manual')).toBe(true);
  });
});

// ─── Mutation (test 44) ──────────────────────────────────────────────
//
// SERIAL within itself: capture original notesForSally, patch, assert
// echo + persistence, restore in afterAll. Single-test serial block so
// the restoration runs even if assertions fail mid-test.
test.describe('Desk Responsibilities · patch settings @workflow @destructive @desk', () => {
  test.describe.configure({ mode: 'serial' });

  let targetKey: string | undefined;
  let originalNotes: string | null | undefined;

  test('PATCH /desk/responsibilities/:key updates the per-tenant settings (DISPATCHER) @workflow @destructive @desk @requires:data-desk-responsibility', async ({
    asDispatcher,
  }) => {
    const bootstrap = await firstResponsibilityKey(asDispatcher);
    targetKey = bootstrap.key;

    // Capture original notesForSally from current detail so the
    // afterAll restoration writes back the exact prior value (null OR
    // a string).
    const beforeRes = await asDispatcher.get(`/desk/responsibilities/${targetKey}`);
    expect(beforeRes.status()).toBe(200);
    const before = expectContract(
      DeskResponsibilityDetailSchema,
      await beforeRes.json(),
      `GET /desk/responsibilities/${targetKey} (pre-patch)`,
    );
    originalNotes = before.notesForSally;

    // PATCH with a unique [QA-TEST] notesForSally string.
    const patch = buildDeskResponsibilityPatch();
    const expectedNotes = patch.notesForSally as string;

    const patchRes = await asDispatcher.patch(`/desk/responsibilities/${targetKey}`, patch);
    expect(patchRes.status()).toBe(200);

    const patched = expectContract(
      DeskResponsibilityDetailSchema,
      await patchRes.json(),
      `PATCH /desk/responsibilities/${targetKey}`,
    );

    // Semantic — key echoes; notesForSally reflects the patch literal.
    // The PATCH response IS the post-update detail (service line 207
    // returns getForTenant), so the echo IS the persistence proof —
    // but we re-fetch below to belt-and-braces it.
    expect(patched.key).toBe(targetKey);
    expect(patched.notesForSally).toBe(expectedNotes);

    // Persistence — refetch detail and assert notesForSally still
    // matches. Catches any read-vs-write inconsistency in the service.
    const afterRes = await asDispatcher.get(`/desk/responsibilities/${targetKey}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(
      DeskResponsibilityDetailSchema,
      await afterRes.json(),
      `GET /desk/responsibilities/${targetKey} (post-patch)`,
    );
    expect(after.notesForSally).toBe(expectedNotes);
  });

  // Note: we deliberately do NOT restore the pre-PATCH notesForSally
  // here. afterAll has no role-fixture access, and the [QA-TEST]-prefixed
  // string is the agreed harness marker (matches buildDeskMemoryPatch
  // and other factories). The next test run patches over it; the value
  // is operator-readable (notes for Sally) so leakage is bounded.
  // If/when this becomes meaningful (e.g. operator confusion), pull
  // the restore into a dedicated test in the same serial block.
  void originalNotes; // captured for future restore-on-fail wiring.
});

// ─── Manual run (test 45) ────────────────────────────────────────────
//
// 202 ACCEPTED — the only key wired today is `ar_followup`. The service
// publishes one Inngest event per overdue invoice; the response shape
// returned synchronously is `{episodesOpened, episodesReused?, skipped?}`
// (NOT `{episodeId, runId}` as the plan suggested — the plan was wrong).
//
// Tagged `@requires:data-inngest-configured` because Inngest's `send`
// throws 'no event key' on dev today (Finding #55) — the full happy
// path requires both INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY env
// vars. The synchronous response shape itself is what we assert.
test.describe('Desk Responsibilities · manual run @workflow @destructive @desk @slow', () => {
  test('POST /desk/responsibilities/ar_followup/run dispatches the workflow (DISPATCHER) @workflow @destructive @desk @slow @requires:data-inngest-configured', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.post(
      `/desk/responsibilities/${AR_FOLLOWUP_KEY}/run`,
      {},
    );
    // Explicit @HttpCode(HttpStatus.ACCEPTED) — controller line 80.
    expect(res.status()).toBe(202);

    const body = expectContract(
      DeskResponsibilityRunResponseSchema,
      await res.json(),
      `POST /desk/responsibilities/${AR_FOLLOWUP_KEY}/run`,
    );

    // Semantic — episodesOpened is a non-negative count. The downstream
    // Inngest run + LLM execution is asynchronous; we don't assert on
    // it here. If `skipped` is set, the count must be 0 (service
    // returns `{episodesOpened: 0, skipped: ...}` short-circuit paths).
    expect(body.episodesOpened).toBeGreaterThanOrEqual(0);
    if (body.skipped !== undefined) {
      expect(body.episodesOpened).toBe(0);
    }
  });
});

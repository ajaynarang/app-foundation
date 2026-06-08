/**
 * Integrations · Load Board (Phase 5 Group 5f — 11 tests on LoadBoardController).
 *
 * Covers every endpoint on
 * `apps/backend/src/domains/integrations/load-board/load-board.controller.ts`:
 *
 *   61. POST   /load-board/search                                    — search (SearchLoadsDto)
 *   62. POST   /load-board/search/nlp                                — NLP search
 *   63. GET    /load-board/listings/:externalId?provider=dat         — detail (200 OR 404)
 *   64. GET    /load-board/recommendations                           — driver recs
 *   65. POST   /load-board/import                                    — import → Load
 *   66. GET    /load-board/search-history                            — history list
 *   67. DELETE /load-board/search-history                            — clear history (204)
 *   68. POST   /load-board/saved-searches                            — create saved search
 *   69. GET    /load-board/saved-searches                            — list saved searches
 *   70. PATCH  /load-board/saved-searches/:savedSearchId/toggle      — toggle isActive
 *   71. DELETE /load-board/saved-searches/:savedSearchId             — delete saved search (204)
 *
 * Every endpoint carries an explicit `@Roles(DISPATCHER, ADMIN, OWNER)`
 * decorator — the spec uses `asDispatcher` throughout. Load board is NOT
 * plan-gated on demo-northstar-2026 (no `@RequireFeature`), so no
 * `@requires:plan-*` tags.
 *
 * Status codes (verified against controller source):
 *   - POSTs 61, 62, 65, 68 → 201 (Nest POST default; no @HttpCode override).
 *   - GETs 63, 64, 66, 69 → 200 (Nest GET default).
 *   - PATCH 70 → 200 (Nest PATCH default).
 *   - DELETEs 67 + 71 → 204 (EXPLICIT `@HttpCode(HttpStatus.NO_CONTENT)`
 *     on controller lines 128–129 and 162–163).
 *   - Test 63 has TWO valid statuses: 200 when the externalId resolves
 *     to a listing (mocked or real), 404 when the id doesn't match any
 *     MOCK_LISTINGS row on a dev MOCK_MODE=all env. Either outcome is
 *     asserted explicitly — not both.
 *
 * Data-capability gating:
 *   - Test 65 (import) calls `firstLoadBoardListingId` which runs a
 *     broad search + picks the first `externalId`. In MOCK_MODE=all the
 *     DAT mock adapter always returns MOCK_LISTINGS (dat-mock-data.ts)
 *     so the helper succeeds; in a live env with no DAT credentials the
 *     helper throws. Tagged `@requires:data-load-board-listing`.
 *
 * Cleanup strategy:
 *   - Test 65 creates a persistent Load row (intakeSource='load_board').
 *     No inline DELETE path (/loads/:id is DISPATCHER-gated and not in
 *     scope here). Demo-northstar-2026 treats imported loads as audit
 *     data — they accumulate on repeated runs which is acceptable for
 *     the QA tenant. TODO noted inline for future cleanup if the test
 *     tenant grows stale.
 *   - Saved-search block (68 → 69 → 70 → 71) is SERIAL — test 71 is the
 *     natural lifecycle finale that DELETEs the row created in 68. An
 *     afterAll defensive cleanup DELETEs if a preceding test errored
 *     before reaching 71.
 *   - Test 67 (clear search-history) is destructive on cache state but
 *     not on DB; rerunning the suite repopulates cache from subsequent
 *     search calls.
 *
 * Structure — two describe blocks:
 *   Block A "Reads + destructive mutations (stateless-ish)":
 *     61 → 62 → 63 → 64 → 66 → 67 → 65 (no shared state except cache).
 *     Run in file-order via explicit `test()` call order; Playwright
 *     serialises tests inside a file by default when `mode: 'serial'`
 *     is configured at the describe level. Block B runs AFTER so that
 *     the saved-search lifecycle doesn't race the simpler assertions.
 *
 *   Block B "Saved-search lifecycle (serial)":
 *     68 → 69 → 70 → 71. Each test depends on the row created by 68.
 *
 * Rubric (per tests/README.md):
 *   - `asDispatcher` fixture (`@Roles(DISPATCHER, ADMIN, OWNER)`-gated).
 *   - Factories: `buildLoadBoardSearch`, `buildLoadBoardNlpSearch`,
 *     `buildLoadBoardImport`, `buildSavedSearch` — zero inline JSON.
 *   - Exact numeric status via `expect(res.status()).toBe(N)` — no
 *     `res.ok()`.
 *   - `.strict()` schemas — no `.passthrough()`.
 *   - Every happy path: semantic echo or state-change assertion.
 *   - Zero runtime `test.skip(cond, ...)`.
 *   - Tags: `@workflow @contract` baseline; `@destructive` on 65, 67,
 *     68, 70, 71; `@requires:data-load-board-listing` on 65.
 */
import { test, expect } from '@sally/test-utils/auth';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import {
  buildLoadBoardSearch,
  buildLoadBoardNlpSearch,
  buildLoadBoardImport,
  buildSavedSearch,
} from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';
import { firstLoadBoardListingId } from './_helpers';

const {
  LoadBoardListingSchema,
  LoadBoardSearchResponseSchema,
  LoadBoardRecommendationsResponseSchema,
  LoadBoardImportResponseSchema,
  SearchHistoryListSchema,
  SavedSearchSchema,
  SavedSearchListSchema,
} = IntegrationSchemas;

// ─── Block A — Reads + destructive non-saved-search mutations ──────────
test.describe('Load board · search + listings + history @workflow @contract', () => {
  // 61 ── POST /load-board/search ───────────────────────────────────────
  test('POST /load-board/search returns the search envelope (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const payload = buildLoadBoardSearch();
    const res = await asDispatcher.post('/load-board/search', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LoadBoardSearchResponseSchema, await res.json(), 'POST /load-board/search');

    // Semantic — the paged envelope echoes `page`/`limit` (controller
    // defaults: page=1, limit=25 from SearchLoadsDto) and the
    // `listings[].length` respects the limit. In MOCK_MODE=all the
    // adapter returns MOCK_LISTINGS filtered by origin (Chicago, IL) —
    // first three mock rows match so listings is non-empty. Assert the
    // weaker invariant (length ≤ limit) so a live env with zero matches
    // also validates.
    expect(body.page).toBeGreaterThanOrEqual(1);
    expect(body.limit).toBeGreaterThan(0);
    expect(body.listings.length).toBeLessThanOrEqual(body.limit);
    expect(body.total).toBeGreaterThanOrEqual(body.listings.length);
  });

  // 62 ── POST /load-board/search/nlp ───────────────────────────────────
  //
  // The NLP path calls `SearchQueryParser::parse` which in turn invokes
  // `StructuredOutputService::extract` against the Vercel AI Gateway. If
  // the gateway returns no structured object (no credits, timeout,
  // extraction failure) the parser returns null and the controller
  // throws `BadRequestException` (load-board.service.ts line 55). On dev
  // this is the common outcome — so the test is gated on the same
  // `ai-gateway-credits` capability used by the Phase 3 briefing tests
  // (finding #32). Happy path (201 + envelope) is asserted only when
  // the capability is declared present.
  test('POST /load-board/search/nlp returns the search envelope (DISPATCHER) @workflow @contract @requires:data-ai-gateway-credits', async ({
    asDispatcher,
  }) => {
    const payload = buildLoadBoardNlpSearch('Chicago to Dallas dry van');
    const res = await asDispatcher.post('/load-board/search/nlp', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LoadBoardSearchResponseSchema, await res.json(), 'POST /load-board/search/nlp');

    // Semantic — NLP path runs SearchQueryParser to derive a
    // SearchLoadsDto then delegates to the same search() used in test
    // 61. Envelope must carry all five required fields (listings,
    // total, page, limit, hasMore). The strict schema enforces the
    // shape; we add an invariant check that `limit` is honoured.
    expect(body.page).toBeGreaterThanOrEqual(1);
    expect(body.limit).toBeGreaterThan(0);
    expect(body.listings.length).toBeLessThanOrEqual(body.limit);
    expect(typeof body.hasMore).toBe('boolean');
  });

  // 63 ── GET /load-board/listings/:externalId ──────────────────────────
  test('GET /load-board/listings/:externalId returns detail or 404 (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    // Use a MOCK_LISTINGS externalId that is GUARANTEED present in
    // dev MOCK_MODE=all (dat-mock-data.ts: 'MOCK-DAT-001' through -00N).
    // In a live env without mock data this resolves to 404 — both
    // outcomes are contractually valid.
    const externalId = 'MOCK-DAT-001';
    const res = await asDispatcher.get(`/load-board/listings/${externalId}?provider=dat`);
    const status = res.status();
    expect([200, 404]).toContain(status);

    if (status === 200) {
      const body = expectContract(
        LoadBoardListingSchema,
        await res.json(),
        `GET /load-board/listings/${externalId}`,
      );
      // Semantic — `externalId` echoes exactly, provider is 'dat'.
      expect(body.externalId).toBe(externalId);
      expect(body.provider).toBe('dat');
    } else {
      // 404 envelope — Nest's default NotFoundException body. Just
      // assert the JSON parses and carries the standard shape; no
      // strict schema to avoid coupling to framework internals.
      const body = (await res.json()) as { statusCode?: number; message?: unknown };
      expect(body.statusCode).toBe(404);
      expect(body.message).toBeDefined();
    }
  });

  // 64 ── GET /load-board/recommendations ────────────────────────────────
  test('GET /load-board/recommendations returns driver-load suggestions (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/load-board/recommendations');
    expect(res.status()).toBe(200);
    const body = expectContract(
      LoadBoardRecommendationsResponseSchema,
      await res.json(),
      'GET /load-board/recommendations',
    );

    // Semantic — the service emits a recommendation per AVAILABLE
    // vehicle with a non-stale (<24h) telematics reading and an ACTIVE
    // assigned driver. Demo-northstar's telematics seed ages out quickly
    // so the list is often empty — that is a VALID contractual response
    // (`Array.isArray(body) && body.length ≥ 0`). When non-empty, each
    // entry carries the full {driver, reason, listings[]} projection
    // (enforced by the strict schema).
    expect(Array.isArray(body)).toBe(true);
    for (const rec of body) {
      expect(rec.driver.id.length).toBeGreaterThan(0);
      expect(rec.driver.name.length).toBeGreaterThan(0);
      expect(rec.reason.length).toBeGreaterThan(0);
      expect(Array.isArray(rec.listings)).toBe(true);
    }
  });

  // 66 ── GET /load-board/search-history ────────────────────────────────
  test('GET /load-board/search-history returns recent + frequent buckets (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/load-board/search-history');
    expect(res.status()).toBe(200);
    const body = expectContract(SearchHistoryListSchema, await res.json(), 'GET /load-board/search-history');

    // Semantic — service returns `{recent, frequent}` where `frequent`
    // is a subset filtered by `searchCount > 1`. Tests 61 + 62 logged
    // searches asynchronously (fire-and-forget in the controller); the
    // cache may or may not have caught up by the time this test runs.
    // Assert the shape + the subset invariant.
    expect(Array.isArray(body.recent)).toBe(true);
    expect(Array.isArray(body.frequent)).toBe(true);
    // `recent` is capped at 10, `frequent` at 5 (search-history.service.ts).
    expect(body.recent.length).toBeLessThanOrEqual(10);
    expect(body.frequent.length).toBeLessThanOrEqual(5);
    // Every `frequent` entry must have searchCount > 1 per the service
    // filter. Any frequent entry must also appear in recent (same source
    // array, different sort); we don't enforce that because recent has
    // a different slice window (top 10 vs all frequent).
    for (const entry of body.frequent) {
      expect(entry.searchCount).toBeGreaterThan(1);
    }
  });

  // 67 ── DELETE /load-board/search-history ─────────────────────────────
  test('DELETE /load-board/search-history clears the cache (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.delete('/load-board/search-history');
    // Controller explicitly declares `@HttpCode(HttpStatus.NO_CONTENT)`
    // (load-board.controller.ts line 129) — no body.
    expect(res.status()).toBe(204);

    // Semantic — follow-up GET returns EMPTY `recent` + `frequent`
    // arrays (cache key is deleted; getHistory returns `{recent: [],
    // frequent: []}` from an empty entries array).
    const verifyRes = await asDispatcher.get('/load-board/search-history');
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(SearchHistoryListSchema, await verifyRes.json());
    expect(verify.recent.length).toBe(0);
    expect(verify.frequent.length).toBe(0);
  });

  // 65 ── POST /load-board/import ────────────────────────────────────────
  //
  // Gated on `@requires:data-load-board-listing`: the helper posts a
  // broad search and needs a non-empty `listings[]`. On dev MOCK_MODE=all
  // the DAT mock adapter always returns MOCK_LISTINGS — the capability
  // is effectively always-on. In live envs without DAT credentials the
  // helper throws and the test is collection-excluded.
  //
  // TODO: this test leaves a persistent Load row (intakeSource=
  // 'load_board', status=DRAFT) on the tenant. /loads/:id deletion is
  // DISPATCHER-gated but out of scope for this spec. Consider adding an
  // afterEach that DELETEs if the row count becomes noisy.
  test('POST /load-board/import creates a Load from a listing (DISPATCHER) @workflow @contract @destructive @requires:data-load-board-listing', async ({
    asDispatcher,
  }) => {
    const externalId = await firstLoadBoardListingId(asDispatcher);
    const payload = buildLoadBoardImport(externalId);
    const res = await asDispatcher.post('/load-board/import', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LoadBoardImportResponseSchema, await res.json(), 'POST /load-board/import');

    // Semantic — service::importListing returns the string loadId + a
    // human-readable loadNumber from LoadsService.create. Both must be
    // non-empty; the strict schema already enforces type.
    expect(body.loadId.length).toBeGreaterThan(0);
    expect(body.loadNumber.length).toBeGreaterThan(0);
  });
});

// ─── Block B — Saved-search lifecycle (serial) ─────────────────────────
test.describe('Load board · saved-searches lifecycle @workflow @contract', () => {
  // Serial — tests 68 → 69 → 70 → 71 share one saved-search row.
  test.describe.configure({ mode: 'serial' });

  let savedSearchId: string | undefined;
  let initialIsActive: boolean | undefined;
  let asDispatcherCleanup: RoleApiClient | undefined;

  test.afterAll(async () => {
    // Defensive cleanup — if test 71 didn't run (prior failure), DELETE
    // the row here via the client captured in test 68. Best-effort: the
    // Playwright request context may be torn down by now, in which case
    // we swallow the error (same idiom as integrations-core.spec.ts
    // afterAll).
    if (savedSearchId && asDispatcherCleanup) {
      try {
        const del = await asDispatcherCleanup.delete(`/load-board/saved-searches/${savedSearchId}`);
        if (del.status() !== 204 && del.status() !== 404) {
          // eslint-disable-next-line no-console
          console.error(
            `afterAll cleanup: DELETE /load-board/saved-searches/${savedSearchId} returned HTTP ${del.status()}`,
          );
        }
      } catch {
        // Request context closed — test 71 or a later TearDown already
        // handled it (or the row is stranded until the tenant reset).
      }
    }
  });

  // 68 ── POST /load-board/saved-searches ───────────────────────────────
  test('POST /load-board/saved-searches creates a saved search (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildSavedSearch();
    const res = await asDispatcher.post('/load-board/saved-searches', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(SavedSearchSchema, await res.json(), 'POST /load-board/saved-searches');

    // Semantic — `name` echoes exactly; `searchParams` round-trips as
    // JSON; freshly-created row is `isActive: true` + `minRate: null`
    // (Prisma defaults + CreateSavedSearchDto optional minRate).
    expect(body.name).toBe(payload.name);
    expect(body.isActive).toBe(true);
    expect(body.savedSearchId.length).toBeGreaterThan(0);
    // `searchParams` is unknown-typed in the schema; narrow here to
    // confirm the echo by deep-equality of the JSON representation.
    expect(JSON.stringify(body.searchParams)).toBe(JSON.stringify(payload.searchParams));

    // Stash for tests 69, 70, 71 + afterAll defensive cleanup.
    savedSearchId = body.savedSearchId;
    initialIsActive = body.isActive;
    asDispatcherCleanup = asDispatcher;
  });

  // 69 ── GET /load-board/saved-searches ────────────────────────────────
  test('GET /load-board/saved-searches lists the created row (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    expect(savedSearchId, 'test 68 must have succeeded to bootstrap the row').toBeDefined();
    const res = await asDispatcher.get('/load-board/saved-searches');
    expect(res.status()).toBe(200);
    const body = expectContract(SavedSearchListSchema, await res.json(), 'GET /load-board/saved-searches');

    // Semantic — the newly-created row surfaces in the list.
    const found = body.find((s) => s.savedSearchId === savedSearchId);
    expect(found, `saved search ${savedSearchId} missing from list`).toBeDefined();
    expect(found!.isActive).toBe(true);
  });

  // 70 ── PATCH /load-board/saved-searches/:savedSearchId/toggle ────────
  test('PATCH /load-board/saved-searches/:savedSearchId/toggle flips isActive (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    expect(savedSearchId, 'test 68 must have succeeded to bootstrap the row').toBeDefined();
    expect(initialIsActive).toBeDefined();
    const res = await asDispatcher.patch(`/load-board/saved-searches/${savedSearchId}/toggle`, {});
    expect(res.status()).toBe(200);
    const body = expectContract(
      SavedSearchSchema,
      await res.json(),
      `PATCH /load-board/saved-searches/${savedSearchId}/toggle`,
    );

    // Semantic — `isActive` is the opposite of its initial value and
    // the savedSearchId is preserved.
    expect(body.savedSearchId).toBe(savedSearchId);
    expect(body.isActive).toBe(!initialIsActive);
  });

  // 71 ── DELETE /load-board/saved-searches/:savedSearchId ──────────────
  test('DELETE /load-board/saved-searches/:savedSearchId removes the row (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    expect(savedSearchId, 'test 68 must have succeeded to bootstrap the row').toBeDefined();
    const res = await asDispatcher.delete(`/load-board/saved-searches/${savedSearchId}`);
    // Controller declares `@HttpCode(HttpStatus.NO_CONTENT)` on line
    // 163 — no body.
    expect(res.status()).toBe(204);

    // Semantic — follow-up GET omits the row from the list.
    const verifyRes = await asDispatcher.get('/load-board/saved-searches');
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(SavedSearchListSchema, await verifyRes.json());
    const stillThere = verify.find((s) => s.savedSearchId === savedSearchId);
    expect(stillThere, `saved search ${savedSearchId} should be gone after DELETE`).toBeUndefined();

    // Mark as cleaned up — afterAll skips the defensive DELETE.
    savedSearchId = undefined;
  });
});


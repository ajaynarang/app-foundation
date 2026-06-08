/**
 * Desk Episodes (Phase 6 Group 6e — 2 tests on DeskEpisodeController).
 *
 * Covers the 2 read-only endpoints on
 * `apps/backend/src/domains/desk/core/episode/desk-episode.controller.ts`:
 *
 *    36. GET /desk/episodes        — cursor-paged list with status filter
 *    37. GET /desk/episodes/:id    — detail (steps + approvals nested)
 *
 * Auth: `@Roles(DISPATCHER, ADMIN, OWNER, SUPER_ADMIN)` at the class
 * level — `asDispatcher` is the canonical happy-path role.
 *
 * Status codes (verified live):
 *   - GET /desk/episodes      → 200
 *   - GET /desk/episodes/:id  → 200 (UUID validated by ParseUUIDPipe;
 *                              non-UUID returns 400 — out of scope here)
 *
 * Persistence: both tests are pure GETs — no DB writes; envelope shape
 * + cursor invariants are the contract.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher`.
 *   - Factories: none (read-only).
 *   - Exact numeric status (`.toBe(200)`).
 *   - expectContract on every assertion.
 *   - Semantic property + state-change/echo on every test.
 *   - Tags: `@workflow @contract @desk` baseline; test 37 carries
 *     `@requires:data-desk-episode`.
 *   - Zero runtime `test.skip(cond, ...)`.
 *
 * Source-of-truth pointers:
 *   - apps/backend/src/domains/desk/core/episode/desk-episode.controller.ts
 *   - apps/backend/src/domains/desk/core/episode/desk-episode.service.ts
 *     — `listForTenant` (lines 26-57) builds the `{rows, nextCursor}`
 *     envelope; `getForTenant` (lines 59-80) builds the detail with
 *     nested steps[] + approvals[].
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, DeskSchemas } from '@sally/test-utils/schemas';
import { firstEpisode } from './_helpers';

const { DeskEpisodeListSchema, DeskEpisodeDetailSchema } = DeskSchemas;

test.describe('Desk Episodes · read paths @workflow @contract @desk', () => {
  // 36 ── GET /desk/episodes ─────────────────────────────────────────
  test('GET /desk/episodes returns the cursor-paged list (DISPATCHER) @workflow @contract @desk', async ({
    asDispatcher,
  }) => {
    // ?limit=5 — service clamps via ListDeskEpisodesQuerySchema (Zod
    // parse, 1..100, default 25). Cursor is null on the first page.
    // No status filter — default returns all statuses ordered by
    // openedAt desc + id desc (service line 40-41).
    const res = await asDispatcher.get('/desk/episodes?limit=5');
    expect(res.status()).toBe(200);

    const body = expectContract(DeskEpisodeListSchema, await res.json(), 'GET /desk/episodes');

    // Semantic — `rows` is bounded by limit; cursor invariant: when the
    // page is non-full (rows.length < limit), nextCursor MUST be null
    // (service line 51 — `hasMore ? formatCursor(...) : null`). The
    // converse (full page → nextCursor non-null) does NOT hold because
    // the service uses `take: limit + 1` to compute `hasMore` — a page
    // of exactly `limit` rows means there were exactly `limit + 1`
    // matches and a cursor IS present. Per-row sanity checks below.
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeLessThanOrEqual(5);
    if (body.rows.length < 5) {
      expect(body.nextCursor).toBeNull();
    }
    for (const row of body.rows) {
      expect(row.tenantId).toBeGreaterThan(0);
      expect(row.responsibilityKey.length).toBeGreaterThan(0);
      expect(row.ownerAgentKey.length).toBeGreaterThan(0);
      expect(row.dedupeKey.length).toBeGreaterThan(0);
    }
  });

  // 37 ── GET /desk/episodes/:id ─────────────────────────────────────
  test('GET /desk/episodes/:id returns the detail with steps + approvals (DISPATCHER) @workflow @contract @desk @requires:data-desk-episode', async ({
    asDispatcher,
  }) => {
    const { id } = await firstEpisode(asDispatcher);

    const res = await asDispatcher.get(`/desk/episodes/${id}`);
    expect(res.status()).toBe(200);

    const body = expectContract(
      DeskEpisodeDetailSchema,
      await res.json(),
      `GET /desk/episodes/${id}`,
    );

    // Semantic — id echoes; steps[] + approvals[] are arrays (may be
    // empty for very-short episodes that closed before any step ran);
    // every step's episodeId matches the parent. The schema enforces
    // structural well-formedness; we re-pin the cross-row invariant.
    expect(body.id).toBe(id);
    expect(Array.isArray(body.steps)).toBe(true);
    expect(Array.isArray(body.approvals)).toBe(true);
    for (const step of body.steps) {
      expect(step.episodeId).toBe(id);
      expect(step.sequence).toBeGreaterThanOrEqual(0);
    }
    for (const approval of body.approvals) {
      expect(approval.episodeId).toBe(id);
    }
  });
});

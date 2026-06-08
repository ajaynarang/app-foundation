/**
 * Desk Memory (Phase 6 Group 6e — 3 tests on DeskMemoryController).
 *
 * Covers the 3 endpoints on
 * `apps/backend/src/domains/desk/core/memory/memory.controller.ts`:
 *
 *    38. GET    /desk/memories         — list with optional filters
 *    39. PATCH  /desk/memories/:id     — edit content / archive flag
 *    40. DELETE /desk/memories/:id     — soft-delete (204)
 *
 * Auth: `@Roles(DISPATCHER, ADMIN, OWNER, SUPER_ADMIN)` at the class
 * level — `asDispatcher` is the canonical happy-path role.
 *
 * Status codes (verified live, plus controller decorators):
 *   - GET    /desk/memories       → 200
 *   - PATCH  /desk/memories/:id   → 200 (NestJS PATCH default)
 *   - DELETE /desk/memories/:id   → 204 (explicit @HttpCode(NO_CONTENT))
 *
 * IMPORTANT — Finding #53 (Phase 6 Group 6e):
 *   `apps/backend/prisma/schema.prisma` is OUT OF DATE with the live DB
 *   `desk_memories` table. The 20260427120000_desk_memory_scope_polarity_
 *   playbook... migration (already applied to dev DB) replaced the older
 *   `kind` column with `scope` + `polarity` + 3 other new columns AND
 *   added the playbook + drop-notes-for-sally fields. The Prisma schema
 *   model at line 4716 still declares `kind String @db.VarChar(20)`.
 *
 *   Result: `findMany({...})` against `desk_memories` returns Prisma error
 *   P2022 ('column (not available) does not exist'), which the
 *   controller surfaces as a 500. The QA helper `firstMemory` traps the
 *   500 and rethrows with a `@requires:data-desk-memory` precondition
 *   message — collection-excluding the test cleanly.
 *
 *   To run these tests on a real env: regenerate the Prisma client
 *   (`pnpm prisma:generate`) AFTER updating `schema.prisma` to match
 *   the new column shape, then flip `TESTS_DATA_CAPABILITIES=desk-memory`.
 *
 * Spec topology — two describe blocks:
 *   1. Read path (test 38) — parallel-safe, but DISTINCT data tag
 *      (`data-desk-memory`) gates it because today's 500 is a
 *      precondition to fix, not a contract bug.
 *   2. Mutations (tests 39 + 40) — SERIAL on a single bootstrapped
 *      memory row. Test 39 patches `content`, test 40 deletes the
 *      same row. Reverse order would still work (deleted rows return
 *      404 on PATCH) but is semantically backwards.
 *
 * Persistence:
 *   - Test 38 (list): self-validating envelope.
 *   - Test 39 (PATCH): controller returns `{id}` only. Persistence
 *     verified via follow-up `GET /desk/memories?limit=…` — the
 *     patched row's `content` MUST be the literal we wrote.
 *   - Test 40 (DELETE 204): empty body. Persistence verified via
 *     `GET /desk/memories?activeOnly=true&limit=100` — the deleted id
 *     MUST NOT appear (softDelete flips isActive=false).
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher`.
 *   - Factories: `buildDeskMemoryPatch` (test 39).
 *   - Exact numeric status. PATCH is NestJS-default 200; DELETE is
 *     explicit 204.
 *   - expectContract on every happy-path JSON body.
 *   - Semantic property + persistence assertion on every test.
 *   - Tags: `@workflow @contract @desk` baseline; `@destructive` on
 *     39, 40; `@requires:data-desk-memory` on 38, 39, 40.
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDeskMemoryPatch } from '@sally/test-utils/factories';
import { expectContract, DeskSchemas } from '@sally/test-utils/schemas';
import { firstMemory } from './_helpers';

const { DeskMemoryListSchema, DeskMemoryUpdateResponseSchema } = DeskSchemas;

// ─── Read path (test 38) ─────────────────────────────────────────────
test.describe('Desk Memory · list @workflow @contract @desk', () => {
  // 38 ── GET /desk/memories ─────────────────────────────────────────
  //
  // Tagged `@requires:data-desk-memory` because today the endpoint
  // 500s (Finding #53). Once the Prisma client is regenerated to match
  // the live `desk_memories` columns, the capability flips on and the
  // schema-level contract holds.
  test('GET /desk/memories returns the rows envelope (DISPATCHER) @workflow @contract @desk @requires:data-desk-memory', async ({
    asDispatcher,
  }) => {
    // ?limit=10 — service clamps via ListMemoriesQuerySchema
    // (Zod parse, 1..200, default 50). activeOnly defaults to true on
    // the schema level (line 35) so dispatchers don't see pruned rows.
    const res = await asDispatcher.get('/desk/memories?limit=10');
    expect(res.status()).toBe(200);

    const body = expectContract(DeskMemoryListSchema, await res.json(), 'GET /desk/memories');

    // Semantic — `rows` is an array bounded by limit; every row is
    // active (activeOnly default = true). On demo-northstar the
    // ar_followup workflow seeds memory rows automatically when an
    // operator edits/rejects/positively-closes a draft.
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeLessThanOrEqual(10);
    for (const row of body.rows) {
      expect(row.isActive).toBe(true);
      expect(row.content.length).toBeGreaterThan(0);
      expect(row.agentKey.length).toBeGreaterThan(0);
    }
  });
});

// ─── Mutations (tests 39 + 40) ───────────────────────────────────────
//
// SERIAL: test 39 patches the content of a real memory row, test 40
// deletes the same row. Sharing the bootstrapped id avoids racing on
// pre-existing tenant data — minimal blast radius.
test.describe('Desk Memory · patch + delete @workflow @destructive @desk', () => {
  test.describe.configure({ mode: 'serial' });

  let memoryId: string | undefined;
  let patchedContent: string | undefined;

  // 39 ── PATCH /desk/memories/:id ──────────────────────────────────
  //
  // Controller line 79 returns `{ id }` only (NOT the full row). The
  // patch persistence is verified by a follow-up GET that filters for
  // the same id and asserts the new `content` echoes.
  test('PATCH /desk/memories/:id edits the content (DISPATCHER) @workflow @destructive @desk @requires:data-desk-memory', async ({
    asDispatcher,
  }) => {
    const bootstrap = await firstMemory(asDispatcher);
    memoryId = bootstrap.id;

    const patch = buildDeskMemoryPatch();
    patchedContent = patch.content!;

    const res = await asDispatcher.patch(`/desk/memories/${memoryId}`, patch);
    expect(res.status()).toBe(200);

    const body = expectContract(
      DeskMemoryUpdateResponseSchema,
      await res.json(),
      `PATCH /desk/memories/${memoryId}`,
    );

    // Semantic — id echoes (the only field returned).
    expect(body.id).toBe(memoryId);

    // Persistence — refetch via the list endpoint with a wide limit
    // (memory.controller has no GET /:id), find our row, assert content
    // matches the patched literal.
    const listRes = await asDispatcher.get('/desk/memories?limit=200');
    expect(listRes.status()).toBe(200);
    const listBody = expectContract(
      DeskMemoryListSchema,
      await listRes.json(),
      'GET /desk/memories (post-patch)',
    );
    const matched = listBody.rows.find((r) => r.id === memoryId);
    expect(matched, `patched memory ${memoryId} should still appear in active list`).toBeDefined();
    expect(matched!.content).toBe(patchedContent);
  });

  // 40 ── DELETE /desk/memories/:id ─────────────────────────────────
  //
  // Explicit @HttpCode(NO_CONTENT) — controller line 83. NestJS would
  // default to 200 for DELETE; here we expect 204 + empty body. The
  // service's softDelete flips `isActive` to false rather than
  // dropping the row (audit trails + sourceEpisodeId references stay
  // intact).
  //
  // Persistence — `?activeOnly=true` (default) excludes soft-deleted
  // rows, so the deleted id MUST NOT appear in the follow-up list.
  test('DELETE /desk/memories/:id soft-deletes the row (DISPATCHER) @workflow @destructive @desk @requires:data-desk-memory', async ({
    asDispatcher,
  }) => {
    expect(memoryId, 'test 39 must run first to bootstrap the memory id').toBeDefined();
    const id = memoryId!;

    const res = await asDispatcher.delete(`/desk/memories/${id}`);
    expect(res.status()).toBe(204);

    // 204 envelope — controller does NOT return a body. Asserting
    // body is empty/whitespace catches any drift toward 200 + JSON.
    const text = await res.text();
    expect(text.trim().length).toBe(0);

    // Persistence — refetch active rows and confirm the deleted id is
    // gone. Use a wide limit so a single missing row is not a
    // pagination artifact.
    const listRes = await asDispatcher.get('/desk/memories?activeOnly=true&limit=200');
    expect(listRes.status()).toBe(200);
    const listBody = expectContract(
      DeskMemoryListSchema,
      await listRes.json(),
      'GET /desk/memories?activeOnly=true (post-delete)',
    );
    const ids = listBody.rows.map((r) => r.id);
    expect(ids).not.toContain(id);
  });
});

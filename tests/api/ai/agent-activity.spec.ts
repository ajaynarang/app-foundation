/**
 * Agent Activity + Developer Scopes (Phase 6 Group 6c — 2 tests).
 *
 * Covers the 2 read-only endpoints on
 * `apps/backend/src/domains/ai/agent-contract/`:
 *
 *    18. GET /agent-activity        — cursor-paged activity log (redacted projection)
 *    19. GET /developer/scopes      — scope vocabulary (NEVER_EXTERNAL_SCOPES filtered)
 *
 * Auth:
 *   - `agent-activity.controller.ts` is class-decorated `@ApiBearerAuth()`
 *     (line 16) and method-decorated `@Roles(DISPATCHER, ADMIN, OWNER, SUPER_ADMIN)`
 *     (line 27). Test uses `asDispatcher` — happy-path representative role.
 *   - `developer-scopes.controller.ts` is class-decorated `@ApiBearerAuth()`
 *     (line 23). No method-level Roles guard — any signed-in user may read
 *     the scope vocabulary. `asDispatcher` is the consistent choice.
 *
 * Required query params (test 18):
 *   The activity controller demands `principalKind` AND `principalId`
 *   on every call (lines 41-46) — no defaults. Tests pass
 *   `principalKind=user` + `principalId=<dispatcher's userId>` so the
 *   service returns the dispatcher's own audit-log rows. The list MAY be
 *   empty — no agent-tool invocations need to have happened on the tenant
 *   for the contract assertion to fire (envelope shape is the gate).
 *
 * Persistence:
 *   - Test 18: GET only — no DB write. Self-validating envelope.
 *   - Test 19: GET only — no DB write. Self-validating array.
 *
 * Cleanup: none required — both tests are read-only.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: asDispatcher.
 *   - Factories: none (read-only GETs).
 *   - Exact numeric status (`.toBe(200)` for both).
 *   - expectContract on every assertion.
 *   - Semantic property on every test.
 *   - Tags: `@workflow @contract` baseline. No data capability gating —
 *     the activity log MAY be empty but the schema enforces shape.
 *   - Zero runtime `test.skip(cond, ...)`.
 *
 * Source-of-truth pointers:
 *   - apps/backend/src/domains/ai/agent-contract/agent-activity.controller.ts
 *   - apps/backend/src/domains/ai/agent-contract/agent-activity.service.ts
 *   - apps/backend/src/domains/ai/agent-contract/developer-scopes.controller.ts
 *   - packages/shared-types/src/ai/agent-activity.schema.ts (mirrors the
 *     `AgentActivityRowSchema` shape).
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, AiSchemas } from '@sally/test-utils/schemas';

const { AgentActivityListSchema, DeveloperScopesResponseSchema } = AiSchemas;

test.describe('Agent Activity · read paths @workflow @contract', () => {
  // 18 ── GET /agent-activity ─────────────────────────────────────────
  test('GET /agent-activity returns the cursor-paged activity log (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
    authState,
  }) => {
    // The controller mandates principalKind + principalId on every
    // request (lines 41-46 — BadRequestException otherwise). We probe
    // the dispatcher's own user-kind audit log; the bare userId is
    // canonicalised inside the service (lines 98-110) to the
    // `user:<id>` audit-log form.
    const dispatcherUserId = authState.users['DISPATCHER'].userId;
    const res = await asDispatcher.get(
      `/agent-activity?principalKind=user&principalId=${encodeURIComponent(dispatcherUserId)}&limit=20`,
    );
    expect(res.status()).toBe(200);
    const body = expectContract(AgentActivityListSchema, await res.json(), 'GET /agent-activity');

    // Semantic — envelope is `{rows, nextCursor}` (NOT `{items}` as the
    // plan §6 sketched — see schema docs). `rows` is bounded by the
    // requested `limit` (service line 81 takes `limit + 1` then trims).
    // `nextCursor` is null when fewer than `limit` rows came back.
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeLessThanOrEqual(20);
    if (body.rows.length < 20) {
      // Strict-mode: when the page is non-full, nextCursor must be null
      // (service line 85: `hasMore ? ... : null`).
      expect(body.nextCursor).toBeNull();
    }
    // Per-row sanity — every row's principalKind must match the query
    // (the WHERE clause filters on it explicitly, line 51-53).
    for (const row of body.rows) {
      expect(row.principalKind).toBe('user');
      expect(row.toolName.length).toBeGreaterThan(0);
      expect(row.scopeRequired.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Developer Scopes · read paths @workflow @contract', () => {
  // 19 ── GET /developer/scopes ──────────────────────────────────────
  test('GET /developer/scopes returns the scope vocabulary (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/developer/scopes');
    expect(res.status()).toBe(200);
    const body = expectContract(DeveloperScopesResponseSchema, await res.json(), 'GET /developer/scopes');

    // Semantic — the response is a flat array (NOT `{scopes: [...]}`),
    // and every entry has a non-empty `summary` + `grantsPlainEnglish`
    // pulled from `SCOPE_DESCRIPTIONS`. The controller (line 33-34)
    // filters `NEVER_EXTERNAL_SCOPES` — `platform:admin` is the only
    // entry in that list today (shared-types line 68), so it MUST NOT
    // appear in the response.
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const scopeNames = body.map((row) => row.scope);
    expect(scopeNames).not.toContain('platform:admin');
    // Every row's hitlTier is one of the 3 enum values (schema enforces;
    // re-asserted here as a semantic check that the response carries
    // tier metadata, not just scope names).
    for (const row of body) {
      expect(['none', 'standard', 'sensitive']).toContain(row.hitlTier);
      expect(row.summary.length).toBeGreaterThan(0);
      expect(row.grantsPlainEnglish.length).toBeGreaterThan(0);
      expect(Array.isArray(row.sampleTools)).toBe(true);
    }
  });
});

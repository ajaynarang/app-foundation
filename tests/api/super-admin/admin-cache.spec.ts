/**
 * Admin Cache (Phase 7 Group 7a — 5 tests on AdminCacheController).
 *
 * Covers the 4 endpoints on
 * `apps/backend/src/domains/admin/admin-cache.controller.ts`:
 *
 *   1. GET  /admin/cache/health
 *   2. GET  /admin/cache/stats
 *   3. POST /admin/cache/flush/:namespace        — parameterised flush
 *   4. POST /admin/cache/flush/:namespace (bogus) — 400 guard
 *   5. POST /admin/cache/flush                   — 400 guard (no confirm)
 *
 * The unconditional `POST /admin/cache/flush` happy path (with
 * `confirm: true`) is OUT OF SCOPE for Phase 7 — flushing ALL
 * `sally:*` namespaces would void the test runner's own JWT
 * (`sally:auth`, `sally:session`, `sally:flags`) mid-suite. The
 * parameterised form (test 3) exercises the same code path on the
 * lowest-impact namespace.
 *
 * Auth: class-level `@Roles(SUPER_ADMIN)`. `asSuperAdmin` is the
 * canonical happy-path fixture.
 *
 * Destructive-op guard: `assertNotProd(ENV.apiBaseUrl)` at file top
 * — refuses to run against any host that doesn't include localhost,
 * 127.0.0.1, or staging.
 *
 * Status codes (verified live 2026-05-15):
 *   - GET /admin/cache/health           → 200
 *   - GET /admin/cache/stats            → 200
 *   - POST /admin/cache/flush/:ns       → 201 (NestJS POST default)
 *   - POST /admin/cache/flush/bogus     → 400 (BadRequestException)
 *   - POST /admin/cache/flush (empty)   → 400 (BadRequestException)
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asSuperAdmin`.
 *   - Factory: `buildFlushCacheBody` (test 5 — empty body guard).
 *   - Exact numeric status. NestJS POST default = 201; both flush
 *     paths have no explicit @HttpCode, so 201 is correct.
 *   - expectContract on every happy path AND every 400 envelope.
 *   - Semantic property on each test (status enum membership;
 *     namespace echoed; flushed count non-negative; error message
 *     specificity).
 *   - Tags: `@workflow @contract @super-admin` baseline;
 *     `@destructive` on test 3.
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildFlushCacheBody } from '@sally/test-utils/factories';
import { expectContract, SuperAdminSchemas } from '@sally/test-utils/schemas';
import { ENV } from '../../config/test-env.js';
import { assertNotProd, SAFE_CACHE_NAMESPACE } from './_helpers';

const { AdminCacheHealthSchema, AdminCacheStatsSchema, AdminCacheFlushResponseSchema, SallyErrorEnvelopeSchema } =
  SuperAdminSchemas;

// Refuse to run against an unfamiliar environment. Flush tests would
// otherwise let a misconfigured CI mutate live infra.
assertNotProd(ENV.apiBaseUrl);

// ─── Read path (tests 1, 2) ──────────────────────────────────────────
test.describe('Admin Cache · read @workflow @contract @super-admin', () => {
  // 1 ── GET /admin/cache/health ──────────────────────────────────
  test('GET /admin/cache/health returns redis connection envelope (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.get('/admin/cache/health');
    expect(res.status()).toBe(200);

    const body = expectContract(AdminCacheHealthSchema, await res.json(), 'GET /admin/cache/health');

    // Semantic: status enum membership. Discriminated union narrows
    // — `body.status` is 'connected' | 'unavailable'.
    expect(['connected', 'unavailable']).toContain(body.status);
    if (body.status === 'connected') {
      // On dev the connected branch is exercised — `redisVersion`
      // is a non-empty semver-ish string.
      expect(body.redisVersion.length).toBeGreaterThan(0);
    }
  });

  // 2 ── GET /admin/cache/stats ───────────────────────────────────
  test('GET /admin/cache/stats returns namespaces + metrics + keyCounts (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.get('/admin/cache/stats');
    expect(res.status()).toBe(200);

    const body = expectContract(AdminCacheStatsSchema, await res.json(), 'GET /admin/cache/stats');

    // Semantic: the safe-flush namespace (`sally:health`) MUST be in
    // the namespace list, otherwise test 3 has no target. Also
    // verifies the CACHE_NAMESPACES constant on the backend includes
    // the value we picked in `_helpers.ts`.
    expect(body.namespaces).toContain(SAFE_CACHE_NAMESPACE);

    // Every key in `keyCounts` is a known namespace (no orphans from
    // the SCAN counter).
    for (const ns of Object.keys(body.keyCounts)) {
      expect(body.namespaces).toContain(ns);
    }
  });
});

// ─── Mutation path (test 3) ──────────────────────────────────────────
test.describe('Admin Cache · flush @workflow @destructive @super-admin', () => {
  // 3 ── POST /admin/cache/flush/:namespace ──────────────────────
  test('POST /admin/cache/flush/:namespace flushes the safe namespace and reports the count (SUPER_ADMIN) @workflow @destructive @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.post(`/admin/cache/flush/${SAFE_CACHE_NAMESPACE}`);
    expect(res.status()).toBe(201);

    const body = expectContract(AdminCacheFlushResponseSchema, await res.json(), 'POST /admin/cache/flush/:namespace');

    // Semantic: `scope` echoes the requested namespace EXACTLY.
    // `flushed` is non-negative (Redis returns the actual delete
    // count; zero is valid when the namespace was empty pre-flush).
    expect(body.scope).toBe(SAFE_CACHE_NAMESPACE);
    expect(body.flushed).toBeGreaterThanOrEqual(0);

    // Persistence: a follow-up GET /admin/cache/stats shows the
    // flushed namespace's keyCount === 0 (the next request that
    // populates the cache will repopulate it; the assertion runs
    // before any unrelated background write can re-fill it).
    const statsRes = await asSuperAdmin.get('/admin/cache/stats');
    expect(statsRes.status()).toBe(200);
    const stats = expectContract(AdminCacheStatsSchema, await statsRes.json(), 'GET /admin/cache/stats (post-flush)');
    // `keyCounts` may omit a namespace entirely when its count is 0;
    // ?? 0 covers both "explicit 0" and "absent" representations.
    expect(stats.keyCounts[SAFE_CACHE_NAMESPACE] ?? 0).toBe(0);
  });
});

// ─── Guard envelopes (tests 4, 5) ────────────────────────────────────
test.describe('Admin Cache · guards @workflow @contract @super-admin', () => {
  // 4 ── POST /admin/cache/flush/:namespace (bogus) → 400 ────────
  test('POST /admin/cache/flush/:namespace rejects unknown namespace with a 400 envelope (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.post('/admin/cache/flush/totally-bogus-ns');
    expect(res.status()).toBe(400);

    const body = expectContract(SallyErrorEnvelopeSchema, await res.json(), 'POST /admin/cache/flush/totally-bogus-ns');

    // Semantic: the error message names the offending value AND
    // lists the valid namespaces — both are part of the controller's
    // public contract (admin-cache.controller.ts:60-63).
    expect(body.message).toMatch(/totally-bogus-ns/);
    expect(body.message).toMatch(/Valid:/);
    expect(body.statusCode).toBe(400);
  });

  // 5 ── POST /admin/cache/flush (no confirm) → 400 ───────────────
  test('POST /admin/cache/flush rejects body missing confirm: true with a 400 envelope (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.post('/admin/cache/flush', buildFlushCacheBody({ confirm: false }));
    expect(res.status()).toBe(400);

    const body = expectContract(SallyErrorEnvelopeSchema, await res.json(), 'POST /admin/cache/flush (confirm=false)');

    // Semantic: the guard message names the required field shape
    // (admin-cache.controller.ts:50-51) so the API consumer can
    // self-correct without reading the source.
    expect(body.message).toMatch(/confirm/i);
    expect(body.statusCode).toBe(400);
  });
});

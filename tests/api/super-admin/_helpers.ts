/**
 * Shared bootstrap helpers for the Phase 7 super-admin spec suite.
 *
 * Group 7a uses `pickSafeCacheNamespace` and `firstScheduleRow`. Future
 * groups (7b admin-jobs + 7c billing-admin) extend this file with
 * `firstFailedJobId`, `withDisposableTenant`, etc.
 *
 * All helpers throw with `@requires:data-*` references in the message
 * so the calling test (which carries the matching tag) is collection-
 * excluded cleanly when the data isn't seeded.
 *
 * Source-of-truth pointers:
 *   - apps/backend/src/domains/admin/admin-cache.controller.ts
 *   - apps/backend/src/domains/admin/admin-schedules.controller.ts
 *   - apps/backend/src/constants/cache.constants.ts (CACHE_NAMESPACES)
 */
import { expect } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';

// ── assertNotProd (destructive-op guard) ─────────────────────────────

/**
 * Throws if the test runner is pointed at anything that smells like
 * production. Cache-flush + schedule-patch tests call this at file
 * top — a misconfigured `API_BASE_URL` would otherwise let a CI run
 * silently mutate a real environment.
 *
 * `localhost`, `127.0.0.1`, and `staging` (case-insensitive) are the
 * only allowed substrings. Per Phase 7 plan §5 "destructive caching
 * tests".
 */
export function assertNotProd(baseUrl: string): void {
  const lc = baseUrl.toLowerCase();
  const ok = lc.includes('localhost') || lc.includes('127.0.0.1') || lc.includes('staging');
  if (!ok) {
    throw new Error(
      `assertNotProd: API_BASE_URL="${baseUrl}" does not contain localhost, 127.0.0.1, or staging. ` +
        'Phase 7 destructive tests refuse to run against unknown environments. If this is a CI ' +
        'environment that should be permitted, add its hostname to the allowlist in tests/api/super-admin/_helpers.ts.',
    );
  }
}

// ── pickSafeCacheNamespace ───────────────────────────────────────────

/**
 * Returns the lowest-impact cache namespace to flush in tests.
 *
 * `sally:health` is the cache backing `GET /admin/cache/health`
 * itself — flushing it has no operational consequence (the next
 * health request rebuilds it). Hardcoded rather than probed because
 * the namespace list is a compile-time constant on the backend
 * (`CACHE_NAMESPACES` in cache.constants.ts).
 *
 * NEVER use `sally:auth`, `sally:session`, `sally:flags`, or
 * `sally:tenants` — those carry session-state, feature gating, or
 * tenant resolution and a flush would void the test runner's own
 * JWT mid-suite.
 */
export const SAFE_CACHE_NAMESPACE = 'sally:health' as const;

// ── firstScheduleRow ─────────────────────────────────────────────────

/**
 * Pick the first BullMQ schedule row, returning its id + current
 * `isEnabled` value so the patch test can flip and restore.
 *
 * `GET /admin/schedules` returns a bare array of
 * `AdminScheduleRowSchema`. On dev 2026-05-15 the demo has 31 rows;
 * empty array implies the ScheduleManagerService hasn't booted (would
 * fail other suites too) — surface as a precondition tagged
 * `@requires:data-schedule-row`.
 *
 * Returns the row whose `category` is `'compliance'` first (deepest
 * shared schedule on dev, least likely to fluctuate). Falls back to
 * row[0] if the compliance row is missing.
 */
export async function firstScheduleRow(
  asSuperAdmin: RoleApiClient,
): Promise<{ id: number; isEnabled: boolean; pattern: string | null; intervalMs: number | null }> {
  const res = await asSuperAdmin.get('/admin/schedules');
  expect(res.status(), 'firstScheduleRow: GET /admin/schedules').toBe(200);
  const rows = (await res.json()) as Array<{
    id?: number;
    isEnabled?: boolean;
    pattern?: string | null;
    intervalMs?: number | null;
    category?: string;
  }>;
  const picked = rows.find((r) => r.category === 'compliance') ?? rows[0];
  if (!picked || typeof picked.id !== 'number' || typeof picked.isEnabled !== 'boolean') {
    throw new Error(
      'firstScheduleRow: no schedule rows on this backend — tag test ' +
        '@requires:data-schedule-row. ScheduleManagerService bootstraps schedules at app start; ' +
        'an empty list implies the BullMQ wiring is misconfigured (other suites will also be ' +
        'failing). Once GET /admin/schedules returns a non-empty array, flip ' +
        'TESTS_DATA_CAPABILITIES=schedule-row.',
    );
  }
  return {
    id: picked.id,
    isEnabled: picked.isEnabled,
    pattern: picked.pattern ?? null,
    intervalMs: picked.intervalMs ?? null,
  };
}

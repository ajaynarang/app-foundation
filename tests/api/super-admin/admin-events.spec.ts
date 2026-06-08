/**
 * Admin Events (Phase 7 Group 7a — 4 tests on AdminEventsController).
 *
 * Covers the 4 endpoints on
 * `apps/backend/src/domains/admin/admin-events.controller.ts`:
 *
 *   6. GET /admin/events                         — paginated cross-tenant list
 *   7. GET /admin/events/stats                   — 24h event-type histogram
 *   8. GET /admin/events/volume                  — hourly buckets (per event)
 *   9. GET /admin/events/webhooks/health         — cross-tenant webhook delivery
 *
 * Auth: class-level `@Roles(SUPER_ADMIN)`. All routes are JWT.
 *
 * NOTE on volume shape: live probe 2026-05-15 returned 21 rows for a
 * 24h window, NOT 24 — only (hour, event) pairs that had events
 * appear, and one row per event-type per hour. The plan's earlier
 * "length === 24" assertion was wrong and is corrected in the
 * schema + this spec.
 *
 * Status codes (verified live 2026-05-15):
 *   - All four → 200 (NestJS GET default).
 *
 * Rubric:
 *   - Role fixture: `asSuperAdmin`.
 *   - Factory: not needed (all read endpoints, no body).
 *   - Exact numeric status `.toBe(200)`.
 *   - expectContract on every body.
 *   - Semantic property on every test (pagination math; histogram
 *     sort order; volume row shape; webhook summary non-negative
 *     ints).
 *   - Tags: `@workflow @contract @super-admin`.
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, SuperAdminSchemas } from '@sally/test-utils/schemas';

const { AdminEventListSchema, AdminEventStatsSchema, AdminEventVolumeSchema, AdminWebhookHealthSchema } =
  SuperAdminSchemas;

test.describe('Admin Events · cross-tenant log @workflow @contract @super-admin', () => {
  // 6 ── GET /admin/events ────────────────────────────────────────
  test('GET /admin/events returns pagination envelope across tenants (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    // ?limit=10 — controller clamps 1..100 (default 50). Small limit
    // keeps the assertion deterministic on busy demo instances.
    const res = await asSuperAdmin.get('/admin/events?limit=10');
    expect(res.status()).toBe(200);

    const body = expectContract(AdminEventListSchema, await res.json(), 'GET /admin/events');

    // Semantic: pagination math — `items.length <= limit`, `total >=
    // items.length`, `limit` echoes the query.
    expect(body.items.length).toBeLessThanOrEqual(10);
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  // 7 ── GET /admin/events/stats ──────────────────────────────────
  test('GET /admin/events/stats returns 24h event histogram (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.get('/admin/events/stats');
    expect(res.status()).toBe(200);

    const body = expectContract(AdminEventStatsSchema, await res.json(), 'GET /admin/events/stats');

    // Semantic: `since` is approximately 24h before now (±5min slack
    // for execution drift). `totalEvents` equals sum of per-event
    // counts.
    const sinceMs = Date.parse(body.since);
    const expectedSinceMs = Date.now() - 24 * 60 * 60 * 1000;
    expect(Math.abs(sinceMs - expectedSinceMs)).toBeLessThan(5 * 60 * 1000);

    const summedCounts = body.eventCounts.reduce((sum, row) => sum + row.count, 0);
    expect(summedCounts).toBe(body.totalEvents);

    // Sort order: histogram is desc by count (admin-events.service
    // contract). Verifying the invariant catches a service-layer
    // refactor that breaks UI ordering.
    for (let i = 1; i < body.eventCounts.length; i++) {
      expect(body.eventCounts[i - 1].count).toBeGreaterThanOrEqual(body.eventCounts[i].count);
    }
  });

  // 8 ── GET /admin/events/volume ─────────────────────────────────
  test('GET /admin/events/volume returns one (hour, event) row per active bucket (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.get('/admin/events/volume');
    expect(res.status()).toBe(200);

    const body = expectContract(AdminEventVolumeSchema, await res.json(), 'GET /admin/events/volume');

    // Semantic: every row has `hour` ISO + `event` non-empty + count
    // positive (zero-count buckets are omitted by the service). At
    // most 24 distinct hour values appear (24h window); each hour can
    // contain multiple rows for different event types, so total rows
    // can exceed 24 — but distinct hours cannot.
    const distinctHours = new Set(body.map((r) => r.hour));
    expect(distinctHours.size).toBeLessThanOrEqual(24);

    for (const row of body) {
      expect(row.count).toBeGreaterThan(0);
    }
  });

  // 9 ── GET /admin/events/webhooks/health ───────────────────────
  test('GET /admin/events/webhooks/health returns cross-tenant delivery summary (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.get('/admin/events/webhooks/health');
    expect(res.status()).toBe(200);

    const body = expectContract(AdminWebhookHealthSchema, await res.json(), 'GET /admin/events/webhooks/health');

    // Semantic: summary arithmetic — delivered + failed <= total.
    // Inflight or pending deliveries make up the gap.
    expect(body.summary.totalDelivered + body.summary.totalFailed).toBeLessThanOrEqual(body.summary.totalDeliveries);

    // `since` is approximately 24h before now (same window as stats).
    const sinceMs = Date.parse(body.since);
    const expectedSinceMs = Date.now() - 24 * 60 * 60 * 1000;
    expect(Math.abs(sinceMs - expectedSinceMs)).toBeLessThan(5 * 60 * 1000);
  });
});

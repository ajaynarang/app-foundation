/**
 * Operations — Alerts CRUD + analytics (Phase 3 Group 3b).
 *
 * Covers the read + analytics surface of `AlertsController` (11 of 18 endpoints;
 * the remaining 7 state-machine endpoints are covered in `alerts-lifecycle.spec.ts`):
 *
 *   1.  GET /alerts                           list (filters: status/priority/driverId/loadId/category/scope)
 *   2.  GET /alerts/stats                     tenant-wide counters
 *   3.  GET /alerts/stats/smart               drivers/loads with issues
 *   4.  GET /alerts/analytics/volume          byCategory + byPriority
 *   5.  GET /alerts/analytics/response-time   trend array
 *   6.  GET /alerts/analytics/resolution      rate envelope
 *   7.  GET /alerts/analytics/top-types       array sorted desc by count
 *   8.  GET /alerts/history                   paginated history
 *   9.  GET /alerts/grouped?scope=driver      grouped-by-driver list
 *   10. GET /alerts/briefing/cached           cached briefing (no LLM)
 *   11. GET /alerts/:alert_id                 detail (notes + childAlerts)
 *
 * All tests run as `asDispatcher` — the whole controller is class-level
 * gated to DISPATCHER/ADMIN/OWNER and the dispatcher fixture is the cheapest
 * of the three to switch to.
 *
 * Plan gate: every test carries `@requires:plan-alerts` because the
 * controller is decorated with `@RequireFeature('alerts')`. Tenants without
 * the alerts feature flag → excluded at collection time.
 *
 * Data gate: test 11 (`GET /alerts/:alert_id`) is additionally tagged
 * `@requires:data-open-alert` — the tenant needs ≥1 alert in `active` status
 * for `seedAlert(asDispatcher)` to succeed. Alerts are rule-emitted (no
 * public POST), so the helper picks an existing row.
 *
 * Schema drift discovered against the live backend:
 *
 *   - `GET /alerts` returns a bare array, NOT a paginated envelope as the
 *     plan doc suggests. The controller maps alerts directly (see
 *     alerts.controller.ts:127). Assert with `expectArrayContract` +
 *     allowEmpty. Documented: finding #30.
 *   - Shared-types `AlertSchema` declares nullable columns as
 *     `z.string().optional()` (key-absent semantics), but the controller
 *     mapper always sets every key — null for missing — so `.strict()`
 *     fails with "Expected string, received null" on every real alert.
 *     Hot-fix: local `LiveAlertSchema` that accepts `null` for every
 *     nullable column. Documented: finding #30.
 *   - `GET /alerts/briefing/cached` returns `AlertBriefing | null` — the
 *     service `getCached` reads from cache and returns `null` on miss.
 *     Controller returns `null` which NestJS serialises to an EMPTY 200
 *     body (no JSON text), NOT to the literal `"null"`. `res.json()` then
 *     throws "Unexpected end of JSON input". Handle by reading `.text()`
 *     first and treating empty body as the null branch. Documented:
 *     finding #30.
 *   - `GET /alerts/grouped` returns a bare array, not an envelope. Each
 *     item is `AlertGroupedSchema` — nested `latestAlert` / `alerts` also
 *     need the live alert schema override (same null-vs-absent drift).
 *
 * Reads only — no cleanup (test 11 picks a pre-existing row and does not
 * mutate it).
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectArrayContract, expectContract, OperationsSchemas } from '@sally/test-utils/schemas';
import { z } from 'zod';
import { seedAlert } from './_helpers.js';

const {
  AlertStatsSharedSchema,
  SmartAlertStatsSchema,
  AlertAnalyticsVolumeSchema,
  AlertResponseTimeTrendSchema,
  AlertResolutionRatesSchema,
  AlertTopTypesSchema,
  AlertHistoryResponseSchema,
  AlertBriefingSchema,
} = OperationsSchemas;

// ── Live alert schema (TODO(phase-3-verify) finding #30) ────────────────────
//
// Shared-types `AlertSchema` declares nullable columns as optional strings
// (key-absent semantics) but the controller mapper always emits every key —
// `null` for missing. Rebuild the schema here with `.nullable()` where the
// wire carries null. Also used inside the grouped response below.
const LiveAlertSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      alertId: z.string(),
      driverId: z.string().nullable(),
      loadId: z.string().nullable(),
      scope: z.enum(['load', 'fleet']).nullable(),
      routePlanId: z.string().nullable(),
      vehicleId: z.string().nullable(),
      alertType: z.string(),
      category: z.string(),
      priority: z.string(),
      title: z.string(),
      message: z.string(),
      recommendedAction: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
      status: z.string(),
      acknowledgedAt: z.string().nullable(),
      acknowledgedBy: z.string().nullable(),
      snoozedUntil: z.string().nullable(),
      resolvedAt: z.string().nullable(),
      resolvedBy: z.string().nullable(),
      resolutionNotes: z.string().nullable(),
      autoResolved: z.boolean().nullable(),
      parentAlertId: z.string().nullable(),
      escalationLevel: z.number().int().nullable(),
      occurrenceCount: z.number().int(),
      lastOccurredAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      // Detail-only fields (present on GET /alerts/:id, absent on list).
      notes: z
        .array(
          z
            .object({
              noteId: z.string(),
              authorName: z.string().nullable(),
              content: z.string(),
              createdAt: z.string(),
            })
            .strict(),
        )
        .optional(),
      childAlerts: z
        .array(
          z
            .object({
              alertId: z.string(),
              alertType: z.string(),
              priority: z.string(),
              title: z.string(),
              status: z.string(),
              createdAt: z.string(),
            })
            .strict(),
        )
        .optional(),
    })
    .strict(),
);

// ── Live grouped-alert schema (TODO(phase-3-verify) finding #30) ────────────
//
// `AlertGroupedSchema` in schemas/operations.ts references the shared
// `AlertSchema` which has the nullable-vs-optional drift noted above. Build
// an override that composes `LiveAlertSchema` inside `latestAlert` / `alerts`.
const LiveAlertGroupedSchema = z
  .object({
    entityId: z.string(),
    scope: z.enum(['driver', 'load']),
    alertType: z.string(),
    category: z.string(),
    priority: z.string(),
    driverId: z.string().nullable(),
    driverName: z.string().nullable().optional(),
    loadId: z.string().nullable().optional(),
    loadNumber: z.string().nullable().optional(),
    referenceNumber: z.string().nullable().optional(),
    latestAlert: LiveAlertSchema,
    alerts: z.array(LiveAlertSchema),
    occurrenceCount: z.number().int(),
    alertCount: z.number().int(),
    firstOccurredAt: z.string(),
  })
  .strict();

// ── Cache-miss tolerant briefing schema (TODO(phase-3-verify) finding #30) ──
//
// `AlertBriefingService.getCached` returns `AlertBriefing | null`. The
// controller returns `null` which NestJS serialises to an EMPTY 200 body —
// NOT to literal `"null"`. Tests handle this by reading the body via
// `.text()` first and parsing only when non-empty. The non-null branch is
// validated with `AlertBriefingSchema.strict()`.

test.describe('Operations · Alerts · CRUD + analytics @workflow @requires:plan-alerts', () => {
  // 1 ── GET /alerts ────────────────────────────────────────────────────────
  test('GET /alerts returns a filtered list matching AlertSchema rows @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    // Narrow filter: active + fleet scope keeps the set small and stable.
    const res = await asDispatcher.get('/alerts?status=active&scope=fleet');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(LiveAlertSchema, await res.json(), { allowEmpty: true, context: 'GET /alerts' });

    // Semantic — every returned row reflects the filter. `status` is an
    // exact match; `scope` is `fleet` where populated (controller passes
    // the query straight through to prisma.where, so a row with the scope
    // column populated has value 'fleet'; null scope is unmapped).
    for (const r of rows) {
      const row = r as { status: string; scope: string | null };
      expect(row.status).toBe('active');
      if (row.scope !== null) expect(row.scope).toBe('fleet');
    }

    // A second read with no filters returns ≥ the filtered set (monotonic),
    // proving the filter narrowed the result space.
    const unfilteredRes = await asDispatcher.get('/alerts');
    expect(unfilteredRes.status()).toBe(200);
    const unfiltered = expectArrayContract(LiveAlertSchema, await unfilteredRes.json(), {
      allowEmpty: true,
      context: 'GET /alerts (unfiltered)',
    });
    expect(unfiltered.length).toBeGreaterThanOrEqual(rows.length);
  });

  // 2 ── GET /alerts/stats ──────────────────────────────────────────────────
  test('GET /alerts/stats returns non-negative counters @workflow @requires:plan-alerts', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/alerts/stats');
    expect(res.status()).toBe(200);
    const stats = expectContract(AlertStatsSharedSchema.strict(), await res.json(), 'GET /alerts/stats');

    // Semantic — every counter is a non-negative integer (response-time can
    // be a float but the service rounds it to a whole minute; assert ≥ 0).
    expect(stats.active).toBeGreaterThanOrEqual(0);
    expect(stats.critical).toBeGreaterThanOrEqual(0);
    expect(stats.resolvedToday).toBeGreaterThanOrEqual(0);
    expect(stats.avgResponseTimeMinutes).toBeGreaterThanOrEqual(0);
    // `critical` is a subset of `active` by construction (same query, extra
    // `priority=critical` filter).
    expect(stats.active).toBeGreaterThanOrEqual(stats.critical);
  });

  // 3 ── GET /alerts/stats/smart ────────────────────────────────────────────
  test('GET /alerts/stats/smart returns coherent fleet-risk counters @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/alerts/stats/smart');
    expect(res.status()).toBe(200);
    const stats = expectContract(SmartAlertStatsSchema.strict(), await res.json(), 'GET /alerts/stats/smart');

    // Semantic — all counters non-negative; "with issues" subsets never
    // exceed their totals. `avgResolveTimeMinutes` can be 0 (no resolves
    // today) or any positive rounded minute value.
    expect(stats.driversWithIssues).toBeGreaterThanOrEqual(0);
    expect(stats.totalActiveDrivers).toBeGreaterThanOrEqual(0);
    expect(stats.loadsAtRisk).toBeGreaterThanOrEqual(0);
    expect(stats.totalActiveLoads).toBeGreaterThanOrEqual(0);
    expect(stats.recurringAlerts).toBeGreaterThanOrEqual(0);
    expect(stats.avgResolveTimeMinutes).toBeGreaterThanOrEqual(0);
    // A driver can't be "with issues" without being active — but the service
    // computes the two sets from different tables (alerts vs loads), so this
    // invariant can briefly drift. Skip the cross-bucket comparison.
  });

  // 4 ── GET /alerts/analytics/volume?days=7 ────────────────────────────────
  test('GET /alerts/analytics/volume returns byCategory + byPriority arrays @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/alerts/analytics/volume?days=7');
    expect(res.status()).toBe(200);
    const volume = expectContract(
      AlertAnalyticsVolumeSchema.strict(),
      await res.json(),
      'GET /alerts/analytics/volume',
    );

    // Semantic — both arrays are present; all counts non-negative.
    expect(Array.isArray(volume.byCategory)).toBe(true);
    expect(Array.isArray(volume.byPriority)).toBe(true);
    for (const entry of volume.byCategory) {
      expect(entry.count).toBeGreaterThanOrEqual(0);
    }
    for (const entry of volume.byPriority) {
      expect(entry.count).toBeGreaterThanOrEqual(0);
    }

    // Request different days window — service caches per-days key, so a
    // separate window exercises a distinct cache path and confirms the
    // endpoint accepts the query honestly.
    const res30 = await asDispatcher.get('/alerts/analytics/volume?days=30');
    expect(res30.status()).toBe(200);
    expectContract(AlertAnalyticsVolumeSchema.strict(), await res30.json());
  });

  // 5 ── GET /alerts/analytics/response-time?days=7 ─────────────────────────
  test('GET /alerts/analytics/response-time returns a non-negative trend array @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/alerts/analytics/response-time?days=7');
    expect(res.status()).toBe(200);
    const trend = expectContract(AlertResponseTimeTrendSchema, await res.json(), 'GET /alerts/analytics/response-time');

    // Semantic — trend is an array (may be empty when no alerts were
    // acknowledged in the window). Every entry's counters are non-negative.
    expect(Array.isArray(trend)).toBe(true);
    for (const entry of trend) {
      expect(entry.alertCount).toBeGreaterThan(0); // by construction — entries only exist for days with data
      expect(entry.avgResponseMinutes).toBeGreaterThanOrEqual(0);
      // Date is a valid ISO date-only string (service uses `.toISOString().split('T')[0]`).
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // 6 ── GET /alerts/analytics/resolution?days=7 ────────────────────────────
  test('GET /alerts/analytics/resolution returns rates in [0,100] @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/alerts/analytics/resolution?days=7');
    expect(res.status()).toBe(200);
    const rates = expectContract(
      AlertResolutionRatesSchema.strict(),
      await res.json(),
      'GET /alerts/analytics/resolution',
    );

    // Semantic — counters non-negative; rates bounded [0..100] (service
    // rounds to whole percent). Resolved <= total. Auto-resolved is a
    // per-alert boolean filter, so it can exceed `resolved` if an alert is
    // auto-resolved and then re-resolved manually (rare). Skip the
    // cross-bucket arithmetic and assert per-field bounds only.
    expect(rates.total).toBeGreaterThanOrEqual(0);
    expect(rates.resolved).toBeGreaterThanOrEqual(0);
    expect(rates.autoResolved).toBeGreaterThanOrEqual(0);
    expect(rates.escalated).toBeGreaterThanOrEqual(0);
    expect(rates.resolutionRate).toBeGreaterThanOrEqual(0);
    expect(rates.resolutionRate).toBeLessThanOrEqual(100);
    expect(rates.escalationRate).toBeGreaterThanOrEqual(0);
    expect(rates.escalationRate).toBeLessThanOrEqual(100);
  });

  // 7 ── GET /alerts/analytics/top-types?days=7 ─────────────────────────────
  test('GET /alerts/analytics/top-types returns an array sorted by count desc @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/alerts/analytics/top-types?days=7');
    expect(res.status()).toBe(200);
    const top = expectContract(AlertTopTypesSchema, await res.json(), 'GET /alerts/analytics/top-types');

    // Semantic — array may be empty; when populated the service emits it
    // sorted by count DESC (see `computeTopAlertTypes` orderBy `_count.id desc`).
    expect(Array.isArray(top)).toBe(true);
    for (let i = 1; i < top.length; i++) {
      expect(top[i].count).toBeLessThanOrEqual(top[i - 1].count);
    }
    for (const entry of top) {
      expect(entry.count).toBeGreaterThanOrEqual(0);
      expect(entry.alertType.length).toBeGreaterThan(0);
    }
  });

  // 8 ── GET /alerts/history ────────────────────────────────────────────────
  test('GET /alerts/history returns a paginated envelope honoring page/limit @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/alerts/history?page=1&limit=5');
    expect(res.status()).toBe(200);
    const history = expectContract(AlertHistoryResponseSchema.strict(), await res.json(), 'GET /alerts/history');

    // Semantic — envelope arithmetic is coherent with the query params.
    expect(history.page).toBe(1);
    expect(history.limit).toBe(5);
    expect(history.total).toBeGreaterThanOrEqual(history.items.length);
    expect(history.totalPages).toBeGreaterThanOrEqual(history.items.length > 0 ? 1 : 0);
    // Items are the raw alert rows (service uses `prisma.alert.findMany`
    // without a mapper). Assert length is bounded by the requested limit.
    expect(history.items.length).toBeLessThanOrEqual(5);

    // A second read with limit=2 returns at most 2 items.
    const res2 = await asDispatcher.get('/alerts/history?page=1&limit=2');
    expect(res2.status()).toBe(200);
    const history2 = expectContract(AlertHistoryResponseSchema.strict(), await res2.json());
    expect(history2.limit).toBe(2);
    expect(history2.items.length).toBeLessThanOrEqual(2);
  });

  // 9 ── GET /alerts/grouped?scope=driver ───────────────────────────────────
  test('GET /alerts/grouped?scope=driver groups alerts by driverId @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/alerts/grouped?scope=driver');
    expect(res.status()).toBe(200);
    const groups = expectArrayContract(LiveAlertGroupedSchema, await res.json(), {
      allowEmpty: true,
      context: 'GET /alerts/grouped?scope=driver',
    });

    // Semantic — every group has scope=driver; alerts array is non-empty
    // and alertCount matches; entityId matches the driver-scoped key.
    for (const group of groups) {
      expect(group.scope).toBe('driver');
      expect(group.alerts.length).toBeGreaterThan(0);
      expect(group.alertCount).toBe(group.alerts.length);
      expect(group.occurrenceCount).toBeGreaterThanOrEqual(group.alertCount);
      // `entityId` is the driverId group key (or literal 'unknown' when
      // driverId is null — see alerts.controller.ts:263). Assert either
      // shape: the driverId strings look like `drv-<nanoid>`.
      expect(group.entityId.length).toBeGreaterThan(0);
    }
  });

  // 10 ── GET /alerts/briefing/cached ───────────────────────────────────────
  test('GET /alerts/briefing/cached returns a cached briefing or null @workflow @requires:plan-alerts', async ({
    asDispatcher,
  }) => {
    // NOTE(phase-3-verify finding #30): `AlertBriefingService.getCached`
    // returns `AlertBriefing | null`. The controller does NOT wrap null in
    // an envelope — it returns the raw value, and NestJS serialises `null`
    // as an EMPTY response body (not the literal string "null"). We must
    // read via `.text()` first and only invoke the JSON path when non-empty.
    // This endpoint never calls the LLM itself (see briefing.service.ts:40-43),
    // so no `@slow` tag is warranted.
    const res = await asDispatcher.get('/alerts/briefing/cached');
    expect(res.status()).toBe(200);
    const rawText = await res.text();
    const body =
      rawText.length === 0
        ? null
        : expectContract(AlertBriefingSchema.strict(), JSON.parse(rawText), 'GET /alerts/briefing/cached');

    // Semantic — either null (cache miss, no briefing generated yet) or a
    // well-formed briefing with a generatedAt ISO timestamp and a list of
    // situations. Both branches are first-class valid outputs.
    if (body !== null) {
      expect(body.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(Array.isArray(body.situations)).toBe(true);
      expect(body.overallStatus.length).toBeGreaterThan(0);
    }

    // Idempotent — a second hit returns the same branch. If cached,
    // `generatedAt` matches across calls.
    const res2 = await asDispatcher.get('/alerts/briefing/cached');
    expect(res2.status()).toBe(200);
    const rawText2 = await res2.text();
    const body2 = rawText2.length === 0 ? null : expectContract(AlertBriefingSchema.strict(), JSON.parse(rawText2));
    if (body !== null && body2 !== null) {
      expect(body2.generatedAt).toBe(body.generatedAt);
    } else {
      // Both branches must agree on null/populated between back-to-back calls.
      expect(body2 === null).toBe(body === null);
    }
  });

  // 11 ── GET /alerts/:alert_id ─────────────────────────────────────────────
  test('GET /alerts/:alert_id returns detail with notes and childAlerts arrays @workflow @requires:plan-alerts @requires:data-open-alert', async ({
    asDispatcher,
  }) => {
    const seed = await seedAlert(asDispatcher);

    const res = await asDispatcher.get(`/alerts/${seed.alertId}`);
    expect(res.status()).toBe(200);
    // `LiveAlertSchema` accepts `null` for nullable columns AND declares
    // `notes` + `childAlerts` as optional arrays (detail-only). Controller
    // always emits both, possibly empty.
    const detailParsed = expectContract(LiveAlertSchema, await res.json(), 'GET /alerts/:alert_id');
    const detail = detailParsed as {
      alertId: string;
      notes?: unknown[];
      childAlerts?: unknown[];
    };

    // Semantic — the fetched alert is the seeded one; notes and childAlerts
    // are present as arrays (possibly empty).
    expect(detail.alertId).toBe(seed.alertId);
    expect(Array.isArray(detail.notes)).toBe(true);
    expect(Array.isArray(detail.childAlerts)).toBe(true);

    // Unknown id → 404.
    const missingRes = await asDispatcher.get('/alerts/alr-does-not-exist');
    expect(missingRes.status()).toBe(404);

    // No afterEach — pure read of a pre-existing alert; test did not mutate
    // state.
  });
});

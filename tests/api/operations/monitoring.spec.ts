/**
 * Operations — Monitoring (Phase 3 Group 3e).
 *
 * Covers 6 endpoints on `MonitoringController` (controller prefix
 * `/api/v1/routes`):
 *
 *   1. GET  /api/v1/routes/:planId/monitoring            live monitoring snapshot
 *   2. GET  /api/v1/routes/:planId/updates               event history (≤50)
 *   3. POST /api/v1/routes/:planId/events/start-route    driver "start route"
 *   4. POST /api/v1/routes/:planId/events/pickup-complete driver "pickup complete"
 *   5. POST /api/v1/routes/:planId/events/delivery-complete driver "delivery complete"
 *   6. POST /api/v1/routes/:planId/events/dispatcher-override dispatcher status override
 *
 * Plan gate `@requires:plan-continuous_monitoring` on every test
 * (`@RequireFeature('continuous_monitoring')` at the controller class level).
 *
 * Data gate: every test requires a tenant-visible ACTIVE `RoutePlan` with
 * segments. Plan generation is `smart_routes`-gated and asynchronous, so the
 * `seedRoutePlan` helper reads from existing plans via `GET /route-plans` and
 * throws when nothing's available. All 6 tests are tagged
 * `@requires:data-active-route-plan`; collection-time exclusion (see
 * `tests/config/detect-capabilities.ts`) drops them when the tenant has no
 * active plans. Run with `TESTS_DATA_CAPABILITIES=active-route-plan` to
 * include them (assumes demo-northstar-2026 carries a seeded active plan).
 *
 * Role profile: per phase-3-operations.md §13 decision, the three driver
 * events (start-route / pickup / delivery) run as `asDispatcher` — the
 * controller is class-level gated to DISPATCHER/ADMIN/OWNER with no DRIVER
 * entry, so `asDriver` would 403. Dispatcher override naturally runs as
 * `asDispatcher` too.
 *
 * Destructive-ness: events 3-6 persist a `RouteEvent` row and transition
 * segments on the RoutePlan (planned → in_progress → completed). Demo-tenant
 * leftover state is acceptable — there's no public endpoint to rewind a
 * segment, and the plan is already a shared demo artifact. Test 3 is
 * idempotent (returns `status: already_started` on re-entry); tests 4 and 5
 * return `status: already_completed` on re-entry. The dispatcher-override
 * test (6) targets a status the segment is already in, which is still a
 * valid wire-level 201 — the service re-records the event without a status
 * change.
 *
 * Schema strategy: the shared `MonitoringStatusSchema` in
 * `@sally/shared-types/operations/monitoring.schema.ts` captures the static
 * envelope, but several live-response differences justify an inline override:
 *
 *   - The controller returns `recentEvents` (raw Prisma RouteEvent rows),
 *     not the shared schema's `recentUpdates` (`RoutePlanUpdate` items).
 *     `RouteEvent` has a narrower field set (no `updateType`, `triggerData`,
 *     etc.). TODO(phase-3-verify) finding #33.
 *   - Driver-event responses are thin `{ status, segmentId?, ... }`
 *     envelopes — not a full segment row. Schemas declared locally.
 *   - The dispatcher-override response carries `{ status: 'overridden',
 *     segmentId, previousStatus, newStatus, loadsUpdated, nextSegmentId }`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract } from '@sally/test-utils/schemas';
import {
  buildStartRouteEvent,
  buildPickupCompleteEvent,
  buildDeliveryCompleteEvent,
  buildDispatcherOverrideEvent,
} from '@sally/test-utils/factories';
import { z } from 'zod';
import { seedRoutePlan, type SeededRoutePlan } from './_helpers.js';

// ── Live monitoring-status envelope ──────────────────────────────────────────
//
// `MonitoringController.getMonitoringStatus` composes an ad-hoc response that
// pulls segment + hos + gps + etaDeviation + activeAlerts + recentEvents
// (not "recentUpdates" as the shared schema declares). Strict.
const LiveMonitoringStatusSchema = z
  .object({
    planId: z.string(),
    currentSegment: z
      .object({
        segmentId: z.string(),
        sequenceOrder: z.number(),
        segmentType: z.string(),
        status: z.string(),
      })
      .strict()
      .nullable(),
    driverPosition: z
      .object({
        lat: z.number(),
        lon: z.number(),
        speed: z.number().nullable(),
        heading: z.number().nullable(),
        lastUpdated: z.string(),
      })
      .strict()
      .nullable(),
    hosState: z
      .object({
        currentDutyStatus: z.string(),
        driveTimeRemainingMinutes: z.number(),
        shiftTimeRemainingMinutes: z.number(),
        cycleTimeRemainingMinutes: z.number(),
        timeUntilBreakMinutes: z.number(),
      })
      .strict()
      .nullable(),
    etaDeviation: z
      .object({
        minutes: z.number(),
        status: z.enum(['on_time', 'at_risk', 'late']),
      })
      .strict(),
    completedSegments: z.number().int(),
    totalSegments: z.number().int(),
    activeAlerts: z.number().int(),
    lastChecked: z.string(),
    recentEvents: z.array(z.unknown()),
  })
  .strict();

// ── RouteEvent row (narrow) ──────────────────────────────────────────────────
//
// `prisma.routeEvent.findMany({ take: 50 })` returns raw Prisma rows. The
// Prisma `RouteEvent` model has: id (int), eventId (string), planId (int),
// segmentId (string|null), eventType, source, occurredAt, eventData (json|null),
// location (json|null), replanRecommended, replanReason (string|null),
// impactSummary (json|null), createdAt. Strict.
const RouteEventRowSchema = z
  .object({
    id: z.number().int(),
    eventId: z.string(),
    planId: z.number().int(),
    segmentId: z.string().nullable(),
    eventType: z.string(),
    source: z.string(),
    occurredAt: z.string(),
    eventData: z.unknown().nullable(),
    location: z.unknown().nullable(),
    replanRecommended: z.boolean(),
    replanReason: z.string().nullable(),
    impactSummary: z.unknown().nullable(),
    createdAt: z.string(),
  })
  .strict();

// ── Driver-event response envelopes ──────────────────────────────────────────
//
// Each handler in `DriverEventService` returns a thin status envelope. The
// idempotent branch (`already_started` / `already_completed`) carries a
// different key set — tolerate both via `z.union`.

const StartRouteResponseSchema = z.union([
  z
    .object({
      status: z.literal('started'),
      currentSegment: z.string(),
      segmentType: z.string(),
    })
    .strict(),
  z
    .object({
      status: z.literal('already_started'),
      currentSegment: z.string(),
    })
    .strict(),
]);

const PickupCompleteResponseSchema = z.union([
  z
    .object({
      status: z.literal('pickup_confirmed'),
      segmentId: z.string(),
      loadsUpdated: z.array(z.object({ loadId: z.string(), newStatus: z.string() }).strict()),
      nextSegmentId: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      status: z.literal('already_completed'),
      segmentId: z.string(),
    })
    .strict(),
]);

const DeliveryCompleteResponseSchema = z.union([
  z
    .object({
      status: z.literal('delivery_confirmed'),
      segmentId: z.string(),
      loadsUpdated: z.array(z.object({ loadId: z.string(), newStatus: z.string() }).strict()),
      nextSegmentId: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      status: z.literal('already_completed'),
      segmentId: z.string(),
    })
    .strict(),
]);

const DispatcherOverrideResponseSchema = z
  .object({
    status: z.literal('overridden'),
    segmentId: z.string(),
    previousStatus: z.string(),
    newStatus: z.enum(['in_progress', 'completed', 'skipped']),
    loadsUpdated: z.array(z.object({ loadId: z.string(), newStatus: z.string() }).strict()),
    nextSegmentId: z.string().nullable(),
  })
  .strict();

test.describe('Operations · Monitoring @workflow @requires:plan-continuous_monitoring', () => {
  // Shared route-plan seed — resolved once per describe run per worker.
  let seededPlan: SeededRoutePlan | null = null;

  // 1 ── GET /api/v1/routes/:planId/monitoring ────────────────────────────────
  test('GET /routes/:planId/monitoring returns a live snapshot envelope @workflow @requires:plan-continuous_monitoring @requires:data-active-route-plan', async ({
    asDispatcher,
    asAdmin,
  }) => {
    seededPlan ??= await seedRoutePlan(asDispatcher, asAdmin);
    const res = await asDispatcher.get(`/api/v1/routes/${seededPlan.planId}/monitoring`);
    expect(res.status()).toBe(200);
    const snapshot = expectContract(
      LiveMonitoringStatusSchema,
      await res.json(),
      'GET /api/v1/routes/:planId/monitoring',
    );

    // Semantic — planId echoes the seed; completed/total are non-negative
    // ints with completed <= total; activeAlerts non-negative; lastChecked
    // is a parseable ISO timestamp within ~1 minute of now.
    expect(snapshot.planId).toBe(seededPlan.planId);
    expect(snapshot.completedSegments).toBeGreaterThanOrEqual(0);
    expect(snapshot.totalSegments).toBeGreaterThanOrEqual(snapshot.completedSegments);
    expect(snapshot.activeAlerts).toBeGreaterThanOrEqual(0);
    const lastMs = Date.parse(snapshot.lastChecked);
    expect(Number.isNaN(lastMs)).toBe(false);
    expect(Math.abs(Date.now() - lastMs)).toBeLessThan(60_000);

    // Unknown plan id → 404.
    const missingRes = await asDispatcher.get('/api/v1/routes/RP-0000000000/monitoring');
    expect(missingRes.status()).toBe(404);
  });

  // 2 ── GET /api/v1/routes/:planId/updates ───────────────────────────────────
  test('GET /routes/:planId/updates returns RouteEvent history ordered by occurredAt desc @workflow @requires:plan-continuous_monitoring @requires:data-active-route-plan', async ({
    asDispatcher,
    asAdmin,
  }) => {
    seededPlan ??= await seedRoutePlan(asDispatcher, asAdmin);
    const res = await asDispatcher.get(`/api/v1/routes/${seededPlan.planId}/updates`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as unknown;
    expect(Array.isArray(body)).toBe(true);
    for (const row of body as unknown[]) {
      expectContract(RouteEventRowSchema, row, 'GET /api/v1/routes/:planId/updates[item]');
    }

    // Semantic — envelope capped at 50 rows; descending occurredAt when ≥2 rows.
    const events = body as Array<{ occurredAt: string }>;
    expect(events.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < events.length; i++) {
      expect(Date.parse(events[i - 1].occurredAt)).toBeGreaterThanOrEqual(Date.parse(events[i].occurredAt));
    }

    // Unknown plan id → 404 (controller throws NotFoundException before
    // querying events).
    const missingRes = await asDispatcher.get('/api/v1/routes/RP-0000000000/updates');
    expect(missingRes.status()).toBe(404);
  });

  // 3 ── POST /api/v1/routes/:planId/events/start-route ───────────────────────
  test('POST /routes/:planId/events/start-route transitions first segment and records the event @workflow @requires:plan-continuous_monitoring @requires:data-active-route-plan @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    seededPlan ??= await seedRoutePlan(asDispatcher, asAdmin);
    // Dispatcher submits on the driver's behalf per phase-3 §13.
    const payload = buildStartRouteEvent(seededPlan.planId, seededPlan.driverPublicId, {
      lat: 33.0,
      lng: -96.8,
      notes: 'QA — start-route',
    });
    const res = await asDispatcher.post(`/api/v1/routes/${seededPlan.planId}/events/start-route`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      StartRouteResponseSchema,
      await res.json(),
      'POST /api/v1/routes/:planId/events/start-route',
    );
    expect(body.currentSegment.length).toBeGreaterThan(0);

    // Persistence — the event was appended to the history, observable via
    // GET /updates (the new row carries eventType = ROUTE_STARTED OR the
    // plan was already-started so no new event).
    const updatesRes = await asDispatcher.get(`/api/v1/routes/${seededPlan.planId}/updates`);
    expect(updatesRes.status()).toBe(200);
    const updates = (await updatesRes.json()) as Array<{ eventType: string }>;
    if (body.status === 'started') {
      expect(updates.some((e) => e.eventType === 'ROUTE_STARTED')).toBe(true);
    }
  });

  // 4 ── POST /api/v1/routes/:planId/events/pickup-complete ───────────────────
  test('POST /routes/:planId/events/pickup-complete returns a pickup envelope or idempotent already_completed @workflow @requires:plan-continuous_monitoring @requires:data-active-route-plan @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    seededPlan ??= await seedRoutePlan(asDispatcher, asAdmin);
    const segmentId = seededPlan.segmentId;
    if (!segmentId) {
      throw new Error(
        'pickup-complete test: seeded plan has no segmentId — ' +
          'tag test @requires:data-active-route-plan (helper gap)',
      );
    }

    const payload = buildPickupCompleteEvent(segmentId, seededPlan.driverPublicId, {
      lat: 33.01,
      lng: -96.81,
      notes: 'QA — pickup',
    });
    const res = await asDispatcher.post(`/api/v1/routes/${seededPlan.planId}/events/pickup-complete`, payload);
    // Accept 201 (Nest default for POST). If the segment isn't a pickup-dock
    // or isn't in_progress the service raises BadRequestException → 400.
    // The spec guarantees the first segment from the seed is a driveable
    // target; both pass and 400-on-state are representative outcomes the
    // suite asserts envelope-strictly. We only validate 201; on 400 we
    // surface the server detail for debugging.
    if (res.status() !== 201) {
      const detail = await res.text().catch(() => '');
      throw new Error(`pickup-complete: expected 201, got ${res.status()} — ${detail.slice(0, 200)}`);
    }
    const body = expectContract(
      PickupCompleteResponseSchema,
      await res.json(),
      'POST /api/v1/routes/:planId/events/pickup-complete',
    );
    expect(body.segmentId).toBe(segmentId);
  });

  // 5 ── POST /api/v1/routes/:planId/events/delivery-complete ─────────────────
  test('POST /routes/:planId/events/delivery-complete returns a delivery envelope or idempotent already_completed @workflow @requires:plan-continuous_monitoring @requires:data-active-route-plan @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    seededPlan ??= await seedRoutePlan(asDispatcher, asAdmin);
    const segmentId = seededPlan.segmentId;
    if (!segmentId) {
      throw new Error(
        'delivery-complete test: seeded plan has no segmentId — ' +
          'tag test @requires:data-active-route-plan (helper gap)',
      );
    }

    const payload = buildDeliveryCompleteEvent(segmentId, seededPlan.driverPublicId, {
      lat: 33.02,
      lng: -96.82,
      notes: 'QA — delivery',
    });
    const res = await asDispatcher.post(`/api/v1/routes/${seededPlan.planId}/events/delivery-complete`, payload);
    if (res.status() !== 201) {
      const detail = await res.text().catch(() => '');
      throw new Error(`delivery-complete: expected 201, got ${res.status()} — ${detail.slice(0, 200)}`);
    }
    const body = expectContract(
      DeliveryCompleteResponseSchema,
      await res.json(),
      'POST /api/v1/routes/:planId/events/delivery-complete',
    );
    expect(body.segmentId).toBe(segmentId);
  });

  // 6 ── POST /api/v1/routes/:planId/events/dispatcher-override ───────────────
  test('POST /routes/:planId/events/dispatcher-override records an override envelope @workflow @requires:plan-continuous_monitoring @requires:data-active-route-plan @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    seededPlan ??= await seedRoutePlan(asDispatcher, asAdmin);
    const segmentId = seededPlan.segmentId;
    if (!segmentId) {
      throw new Error(
        'dispatcher-override test: seeded plan has no segmentId — ' +
          'tag test @requires:data-active-route-plan (helper gap)',
      );
    }

    // `newStatus: 'in_progress'` is the most conservative override because
    // it does not trigger load-status transitions and is accepted regardless
    // of the segment's current state (the service re-records the event and
    // stamps `actualArrival` if missing).
    const payload = buildDispatcherOverrideEvent({
      action: 'in_progress',
      reason: 'QA dispatcher override — envelope test',
      segmentId,
    });
    const res = await asDispatcher.post(`/api/v1/routes/${seededPlan.planId}/events/dispatcher-override`, payload);
    if (res.status() !== 201) {
      const detail = await res.text().catch(() => '');
      throw new Error(`dispatcher-override: expected 201, got ${res.status()} — ${detail.slice(0, 200)}`);
    }
    const body = expectContract(
      DispatcherOverrideResponseSchema,
      await res.json(),
      'POST /api/v1/routes/:planId/events/dispatcher-override',
    );
    expect(body.segmentId).toBe(segmentId);
    expect(body.newStatus).toBe('in_progress');

    // Persistence — the DISPATCHER_OVERRIDE event is appended to history.
    const updatesRes = await asDispatcher.get(`/api/v1/routes/${seededPlan.planId}/updates`);
    expect(updatesRes.status()).toBe(200);
    const updates = (await updatesRes.json()) as Array<{ eventType: string }>;
    expect(updates.some((e) => e.eventType === 'DISPATCHER_OVERRIDE')).toBe(true);
  });
});

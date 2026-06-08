/**
 * Operations — Alerts lifecycle (Phase 3 Group 3c).
 *
 * Covers the 7 state-machine + bulk + briefing endpoints on
 * `AlertsController` (the remaining 11 are in `alerts-crud.spec.ts`):
 *
 *   1. POST /alerts/:alert_id/acknowledge     any → ACKNOWLEDGED
 *   2. POST /alerts/:alert_id/resolve         any → RESOLVED
 *   3. POST /alerts/:alert_id/snooze          any → SNOOZED + snoozedUntil
 *   4. POST /alerts/:alert_id/notes           append an AlertNote
 *   5. POST /alerts/bulk/acknowledge          N rows → acknowledged
 *   6. POST /alerts/bulk/resolve              N rows → resolved
 *   7. POST /alerts/briefing                  generate AI briefing (live LLM)
 *
 * All tests run as `asDispatcher` — the whole controller is class-level gated
 * to DISPATCHER/ADMIN/OWNER. Plan gate `@requires:plan-alerts` on every test.
 *
 * Data gate: tests 1-4 each call `seedAlert(asDispatcher)` which picks one
 * OPEN alert. Tests 5-6 need ≥2 OPEN alerts (a file-local helper picks them)
 * AND a routable bulk endpoint — `@requires:data-alerts-bulk-routable` covers
 * finding #31 (below). Test 7 (briefing) works regardless of alert count
 * (the LLM can summarise zero alerts), so it carries no data gate — only
 * `@slow` because it invokes Mastra + OpenAI. Under infra constraints (AI
 * gateway credits) the briefing endpoint may return 500; that gap is tracked
 * in finding #32.
 *
 * State pollution: acknowledge / resolve / snooze flip status irreversibly
 * (from the viewpoint of this suite — the cron replenishes OPEN alerts on
 * the demo tenant). Every mutation test is `@destructive`. No afterEach
 * restoration: doing so would either (a) require writing directly to Prisma
 * which we explicitly avoid, or (b) use a non-existent "reopen" endpoint.
 * Tests 5-6 mutate 2 alerts each; same rationale. If a CI run happens to
 * consume the last remaining OPEN alerts, subsequent runs will exclude
 * data-gated tests until the cron refills the tenant — that's the expected
 * long-term equilibrium.
 *
 * Serial execution for tests 1-4: each test calls `seedAlert(asDispatcher)`
 * which always returns the FIRST OPEN alert (ordered by the controller).
 * Under parallel workers, two tests collide on the same alertId — worker B
 * reads "active", worker A writes "resolved", worker B's subsequent detail
 * GET sees "resolved" instead of its own mutation's expected state. Wrapping
 * tests 1-4 in `test.describe.serial` serialises them on a per-file basis;
 * tests 5-7 operate on independent alert sets and stay parallel-safe.
 *
 * Schema drift: POST mutation responses are bespoke envelopes (NOT the full
 * `AlertSchema`). The controller returns `{ alertId, status, ..., message }`
 * per endpoint — see `alerts.controller.ts:451-549`. We hand-write the exact
 * shape for each; there is no shared-types peer to reach for.
 *
 * NestJS default: plain `@Post(...)` without `@HttpCode` returns 201. All
 * five mutation endpoints in this file use the default, including the two
 * that semantically feel like 200 state transitions. Briefing is also 201.
 *
 * Finding #31 (new): the bulk endpoints are shadowed by the single-id routes.
 * `@Post(':alert_id/acknowledge')` is declared BEFORE `@Post('bulk/acknowledge')`
 * inside `AlertsController`, so Nest matches `POST /alerts/bulk/acknowledge`
 * as `acknowledgeAlert(alertId='bulk')` → 404 "Alert bulk not found". Same
 * for `/bulk/resolve`, where the caller's body then trips
 * `forbidNonWhitelisted` on the narrower ResolveAlertDto → 400. Until the
 * controller is reordered or the bulk routes are moved under a distinct
 * path prefix, these tests are data-gated off via the new capability
 * `alerts-bulk-routable` (added to KNOWN_DATA_CAPABILITIES).
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, OperationsSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import {
  buildAlertNote,
  buildBulkAcknowledgePayload,
  buildBulkResolveAlertsPayload,
  buildResolveAlertPayload,
  buildSnoozeAlertPayload,
} from '@sally/test-utils/factories';
import { z } from 'zod';
import { seedAlert } from './_helpers.js';

const { AlertBriefingSchema } = OperationsSchemas;

// ── Response-envelope schemas (hand-written, strict) ─────────────────────────
//
// Shapes reverse-engineered from alerts.controller.ts. Each mutation returns
// a trimmed envelope — alertId + status + the timestamp/field that changed +
// a human-readable `message`. Not the full AlertSchema.

const AcknowledgeResponseSchema = z
  .object({
    alertId: z.string(),
    status: z.string(),
    // `acknowledgedAt` is a Date serialised to ISO string on the wire.
    acknowledgedAt: z.string(),
    // `acknowledgedBy` is the authenticated user's public id (string).
    acknowledgedBy: z.string(),
    message: z.string(),
  })
  .strict();

const ResolveResponseSchema = z
  .object({
    alertId: z.string(),
    status: z.string(),
    resolvedAt: z.string(),
    // Optional on the DTO — echoed back as `null` when caller omits it, or
    // as the submitted string. Allow both.
    resolutionNotes: z.string().nullable(),
    message: z.string(),
  })
  .strict();

const SnoozeResponseSchema = z
  .object({
    alertId: z.string(),
    status: z.string(),
    snoozedUntil: z.string(),
    message: z.string(),
  })
  .strict();

const AddNoteResponseSchema = z
  .object({
    noteId: z.string(),
    alertId: z.string(),
    authorName: z.string(),
    content: z.string(),
    createdAt: z.string(),
  })
  .strict();

const BulkResultSchema = z
  .object({
    updated: z.number().int(),
    message: z.string(),
  })
  .strict();

// ── LiveAlertSchema (detail read after mutation) ─────────────────────────────
//
// Full detail shape — mirrors alerts-crud.spec.ts::LiveAlertSchema. See
// finding #30 (nullable drift) for why these columns need `.nullable()`
// rather than `.optional()`. Strict so an unknown field added by the
// controller mapper surfaces as a parse failure here first.
const LiveAlertDetailSchema = z
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
    notes: z.array(
      z
        .object({
          noteId: z.string(),
          authorName: z.string().nullable(),
          content: z.string(),
          createdAt: z.string(),
        })
        .strict(),
    ),
    childAlerts: z.array(
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
    ),
  })
  .strict();

// ── Briefing response reuses `AlertBriefingSchema` imported at top. ──────────

// ── Spec-local helper: pick N OPEN alerts ─────────────────────────────────────
//
// Bulk tests require a fixed minimum of OPEN alerts. When the tenant has
// fewer than N, the helper throws and the test — tagged
// `@requires:data-open-alert` — is excluded at collection time. Lives here
// rather than in `_helpers.ts` because it is only needed by the two bulk
// tests in this file.
async function getOpenAlerts(api: RoleApiClient, limit: number): Promise<string[]> {
  const res = await api.get(`/alerts?status=active&limit=${limit + 2}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as unknown;
  const items = Array.isArray(body) ? (body as Array<{ alertId?: string }>) : [];
  const ids = items.map((a) => a.alertId).filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length < limit) {
    throw new Error(
      `getOpenAlerts: need ${limit} OPEN alerts, got ${ids.length} — ` + `tag test @requires:data-open-alert`,
    );
  }
  return ids.slice(0, limit);
}

test.describe('Operations · Alerts · lifecycle @workflow @requires:plan-alerts @destructive', () => {
  // Tests 1-4 all call `seedAlert` which returns the FIRST OPEN alert.
  // Running them in parallel means two workers collide on the same alertId,
  // so wrap them in `.serial`. Tests 5-6 (bulk) use their own independent
  // set via `getOpenAlerts(api, 2)` and stay parallel-safe. Test 7
  // (briefing) does not touch any specific alert.
  test.describe.serial('Single-alert lifecycle', () => {
    // 1 ── POST /alerts/:alert_id/acknowledge ───────────────────────────────
    test('POST /alerts/:alert_id/acknowledge flips status to acknowledged @workflow @requires:plan-alerts @requires:data-open-alert @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedAlert(asDispatcher);

      const res = await asDispatcher.post(`/alerts/${seed.alertId}/acknowledge`, undefined);
      expect(res.status()).toBe(201);
      const body = expectContract(AcknowledgeResponseSchema, await res.json(), 'POST /alerts/:alert_id/acknowledge');

      // Semantic — the envelope echoes the seeded alert id; status flips to
      // `acknowledged`; acknowledgedAt is a recent ISO timestamp.
      expect(body.alertId).toBe(seed.alertId);
      expect(body.status).toBe('acknowledged');
      const ackTime = Date.parse(body.acknowledgedAt);
      expect(Number.isNaN(ackTime)).toBe(false);
      expect(Date.now() - ackTime).toBeLessThan(60_000);

      // Persistence — a follow-up detail read reflects the new status + field.
      const detailRes = await asDispatcher.get(`/alerts/${seed.alertId}`);
      expect(detailRes.status()).toBe(200);
      const detail = LiveAlertDetailSchema.parse(await detailRes.json());
      expect(detail.status).toBe('acknowledged');
      expect(detail.acknowledgedAt).not.toBeNull();
    });

    // 2 ── POST /alerts/:alert_id/resolve ──────────────────────────────────────
    test('POST /alerts/:alert_id/resolve transitions to resolved with notes echoed @workflow @requires:plan-alerts @requires:data-open-alert @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedAlert(asDispatcher);
      const payload = buildResolveAlertPayload();

      const res = await asDispatcher.post(`/alerts/${seed.alertId}/resolve`, payload);
      expect(res.status()).toBe(201);
      const body = expectContract(ResolveResponseSchema, await res.json(), 'POST /alerts/:alert_id/resolve');

      // Semantic — status flips to `resolved`; resolvedAt is recent; the
      // submitted notes are echoed back verbatim.
      expect(body.alertId).toBe(seed.alertId);
      expect(body.status).toBe('resolved');
      expect(body.resolutionNotes).toBe(payload.resolutionNotes);
      const resolvedTime = Date.parse(body.resolvedAt);
      expect(Number.isNaN(resolvedTime)).toBe(false);
      expect(Date.now() - resolvedTime).toBeLessThan(60_000);

      // Persistence — detail carries the same status + notes.
      const detailRes = await asDispatcher.get(`/alerts/${seed.alertId}`);
      expect(detailRes.status()).toBe(200);
      const detail = LiveAlertDetailSchema.parse(await detailRes.json());
      expect(detail.status).toBe('resolved');
      expect(detail.resolvedAt).not.toBeNull();
      expect(detail.resolutionNotes).toBe(payload.resolutionNotes);
    });

    // 3 ── POST /alerts/:alert_id/snooze ──────────────────────────────────────
    test('POST /alerts/:alert_id/snooze sets status + snoozedUntil honouring durationMinutes @workflow @requires:plan-alerts @requires:data-open-alert @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedAlert(asDispatcher);
      const payload = buildSnoozeAlertPayload({ durationMinutes: 60 });

      const beforeMs = Date.now();
      const res = await asDispatcher.post(`/alerts/${seed.alertId}/snooze`, payload);
      expect(res.status()).toBe(201);
      const body = expectContract(SnoozeResponseSchema, await res.json(), 'POST /alerts/:alert_id/snooze');

      // Semantic — status flips to `snoozed`; `snoozedUntil` is roughly
      // beforeMs + durationMinutes * 60000, within a ±30s slack for clock
      // skew + network latency.
      expect(body.alertId).toBe(seed.alertId);
      expect(body.status).toBe('snoozed');
      const snoozedUntilMs = Date.parse(body.snoozedUntil);
      expect(Number.isNaN(snoozedUntilMs)).toBe(false);
      const expectedMs = beforeMs + payload.durationMinutes * 60_000;
      expect(Math.abs(snoozedUntilMs - expectedMs)).toBeLessThan(30_000);

      // Persistence — detail reflects snoozed status + snoozedUntil value.
      const detailRes = await asDispatcher.get(`/alerts/${seed.alertId}`);
      expect(detailRes.status()).toBe(200);
      const detail = LiveAlertDetailSchema.parse(await detailRes.json());
      expect(detail.status).toBe('snoozed');
      expect(detail.snoozedUntil).toBe(body.snoozedUntil);
    });

    // 4 ── POST /alerts/:alert_id/notes ────────────────────────────────────────
    test('POST /alerts/:alert_id/notes appends a note visible on detail @workflow @requires:plan-alerts @requires:data-open-alert @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedAlert(asDispatcher);

      // Capture the note count before adding — we assert `length + 1` after.
      const beforeRes = await asDispatcher.get(`/alerts/${seed.alertId}`);
      expect(beforeRes.status()).toBe(200);
      const before = LiveAlertDetailSchema.parse(await beforeRes.json());
      const notesBefore = before.notes?.length ?? 0;

      const payload = buildAlertNote();
      const res = await asDispatcher.post(`/alerts/${seed.alertId}/notes`, payload);
      expect(res.status()).toBe(201);
      const body = expectContract(AddNoteResponseSchema, await res.json(), 'POST /alerts/:alert_id/notes');

      // Semantic — the note echoes the seeded alert id, carries a non-empty
      // authorName (built from user.firstName/lastName/email), and the content
      // is the submitted payload.
      expect(body.alertId).toBe(seed.alertId);
      expect(body.content).toBe(payload.content);
      expect(body.authorName.length).toBeGreaterThan(0);

      // Persistence — detail.notes grew by exactly one and contains the new
      // note with matching content.
      const afterRes = await asDispatcher.get(`/alerts/${seed.alertId}`);
      expect(afterRes.status()).toBe(200);
      const after = LiveAlertDetailSchema.parse(await afterRes.json());
      expect(after.notes?.length ?? 0).toBe(notesBefore + 1);
      const matching = (after.notes ?? []).find((n) => n.noteId === body.noteId);
      expect(matching).toBeDefined();
      expect(matching?.content).toBe(payload.content);
    });
  }); // describe.serial "Single-alert lifecycle"

  // 5 ── POST /alerts/bulk/acknowledge ───────────────────────────────────────
  test('POST /alerts/bulk/acknowledge acknowledges every submitted alert @workflow @requires:plan-alerts @requires:data-open-alert @requires:data-alerts-bulk-routable @destructive', async ({
    asDispatcher,
  }) => {
    const alertIds = await getOpenAlerts(asDispatcher, 2);
    const payload = buildBulkAcknowledgePayload(alertIds);

    const res = await asDispatcher.post('/alerts/bulk/acknowledge', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(BulkResultSchema, await res.json(), 'POST /alerts/bulk/acknowledge');

    // Semantic — updated count matches the batch size (all rows were OPEN
    // and owned by this tenant, so updateMany's count equals input length).
    expect(body.updated).toBe(alertIds.length);

    // Persistence — every submitted alert is now `acknowledged`.
    for (const id of alertIds) {
      const detailRes = await asDispatcher.get(`/alerts/${id}`);
      expect(detailRes.status()).toBe(200);
      const detail = LiveAlertDetailSchema.parse(await detailRes.json());
      expect(detail.status).toBe('acknowledged');
      expect(detail.acknowledgedAt).not.toBeNull();
    }
  });

  // 6 ── POST /alerts/bulk/resolve ───────────────────────────────────────────
  test('POST /alerts/bulk/resolve resolves every submitted alert with shared notes @workflow @requires:plan-alerts @requires:data-open-alert @requires:data-alerts-bulk-routable @destructive', async ({
    asDispatcher,
  }) => {
    const alertIds = await getOpenAlerts(asDispatcher, 2);
    const payload = buildBulkResolveAlertsPayload(alertIds, {
      resolutionNotes: 'QA bulk-resolve',
    });

    const res = await asDispatcher.post('/alerts/bulk/resolve', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(BulkResultSchema, await res.json(), 'POST /alerts/bulk/resolve');

    // Semantic — updated count matches the batch size.
    expect(body.updated).toBe(alertIds.length);

    // Persistence — every submitted alert is now `resolved` and carries the
    // shared resolutionNotes string.
    for (const id of alertIds) {
      const detailRes = await asDispatcher.get(`/alerts/${id}`);
      expect(detailRes.status()).toBe(200);
      const detail = LiveAlertDetailSchema.parse(await detailRes.json());
      expect(detail.status).toBe('resolved');
      expect(detail.resolvedAt).not.toBeNull();
      expect(detail.resolutionNotes).toBe('QA bulk-resolve');
    }
  });

  // 7 ── POST /alerts/briefing ───────────────────────────────────────────────
  test('POST /alerts/briefing?force=true returns a contract-valid briefing @workflow @requires:plan-alerts @requires:data-ai-gateway-credits @slow', async ({
    asDispatcher,
  }) => {
    // `force=true` bypasses the cache read and always drives the LLM path.
    // The LLM call may take 10-30s on a cold Mastra agent — hence `@slow`.
    // We do NOT evaluate content quality (that's for tests/evals/); contract
    // only: overallStatus is a non-empty string, situations is an array of
    // strict-valid entries, generatedAt is a fresh ISO timestamp.
    const res = await asDispatcher.post('/alerts/briefing?force=true', undefined, { timeout: 60_000 });
    expect(res.status()).toBe(201);
    const briefing = expectContract(AlertBriefingSchema.strict(), await res.json(), 'POST /alerts/briefing?force=true');

    // Semantic — overallStatus is non-empty; situations is an array (may be
    // empty when the tenant has no active alerts); generatedAt is within the
    // last 2 minutes.
    expect(briefing.overallStatus.length).toBeGreaterThan(0);
    expect(Array.isArray(briefing.situations)).toBe(true);
    const generatedMs = Date.parse(briefing.generatedAt);
    expect(Number.isNaN(generatedMs)).toBe(false);
    expect(Date.now() - generatedMs).toBeLessThan(120_000);
  });
});

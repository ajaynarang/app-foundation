/**
 * Financials — Close-Out API (Phase 2 Group 2a)
 *
 * Covers all 5 endpoints on `CloseOutController`:
 *   - GET  /close-out/summary              → counts per billing status
 *   - GET  /close-out                      → `{ loads, total }` list
 *   - GET  /close-out/:loadId/readiness    → `BillingReadinessResult`
 *   - POST /close-out/:loadId/approve      → transitions billingStatus to APPROVED
 *   - POST /close-out/:loadId/send-back    → transitions APPROVED → READY_FOR_REVIEW
 *
 * Role rules (from `@Roles` decorators on `CloseOutController`):
 *   - All 5 endpoints → DISPATCHER, ADMIN, OWNER — `asDispatcher` suffices,
 *     except the tenant-settings toggle which requires ADMIN (`asAdmin`).
 *
 * State dependency:
 *   The readiness/approve/send-back tests bootstrap a load through the full
 *   lifecycle (PENDING → ASSIGNED → IN_TRANSIT → DELIVERED) via the shared
 *   `createDeliveredLoad` helper — a fresh DELIVERED load with no uploaded
 *   documents has `billingStatus = PENDING_DOCUMENTS` and `readiness.score < 100`,
 *   which matches the real-world close-out entry point.
 *
 * Approve / send-back dependency on tenant settings:
 *   The default `FleetOperationsSettings` on `demo-northstar-2026` has
 *   `allowBillingOverride: false`. The approve endpoint rejects any sub-100
 *   readiness with `400 "Cannot approve: missing ..."` unless both the
 *   tenant flag is true AND `overrideReason` is supplied. `withBillingOverrideEnabled`
 *   (see `_helpers.ts`) flips the flag to true for the affected tests and
 *   restores it afterwards — idempotent, minimum-blast-radius.
 *
 * Schema strategy:
 *   All schemas re-exported from `@sally/shared-types` via the test-utils
 *   namespace (see `packages/test-utils/src/schemas/close-out.ts` for drift
 *   notes). `CloseOutListResponseSchema` is the only hand-written one — the
 *   service returns `{ loads, total }`, not the `{ data, limit, offset }`
 *   envelope used by `GET /loads`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildApproveForBilling, buildSendBackPayload } from '@sally/test-utils/factories';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, CloseOutSchemas } from '@sally/test-utils/schemas';
import { createDeliveredLoad, withBillingOverrideEnabled } from './_helpers.js';

const {
  CloseOutSummarySchema,
  CloseOutListResponseSchema,
  BillingReadinessResponseSchema,
  ApproveForBillingResponseSchema,
  SendBackResponseSchema,
} = CloseOutSchemas;

test.describe('Financials · Close-Out @workflow', () => {
  // Track loads + drivers created by tests for afterEach cleanup.
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  // 1 ── GET /close-out/summary ────────────────────────────────────
  test('GET /close-out/summary returns billing-queue counts @workflow', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/close-out/summary');
    expect(res.status()).toBe(200);
    const summary = expectContract(CloseOutSummarySchema.strict(), await res.json(), 'GET /close-out/summary');

    // Semantic: counts are non-negative and `total` mirrors the sum of the
    // three tracked billingStatus buckets — see `CloseOutService.getSummary`.
    expect(summary.needsDocs).toBeGreaterThanOrEqual(0);
    expect(summary.readyForReview).toBeGreaterThanOrEqual(0);
    expect(summary.readyToBill).toBeGreaterThanOrEqual(0);
    expect(summary.overduePods).toBeGreaterThanOrEqual(0);
    expect(summary.readyToBillTotalCents).toBeGreaterThanOrEqual(0);
    expect(summary.total).toBe(summary.needsDocs + summary.readyForReview + summary.readyToBill);
  });

  // 2 ── GET /close-out ────────────────────────────────────────────
  test('GET /close-out lists loads in the billing queue @workflow @destructive', async ({ asDispatcher, asAdmin }) => {
    // Seed a fresh DELIVERED load so the list is guaranteed non-empty and we
    // have a row whose shape we can semantically verify.
    const setup = await createDeliveredLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Seeded tenant has many DELIVERED loads — scope the list via `?search`
    // to guarantee our row is on page 1.
    const res = await asDispatcher.get(`/close-out?search=${encodeURIComponent(setup.loadNumber)}`);
    expect(res.status()).toBe(200);
    const body = expectContract(CloseOutListResponseSchema.strict(), await res.json(), 'GET /close-out');

    // Semantic: our seeded DELIVERED load shows up with a valid billingStatus.
    // A fresh DELIVERED load without docs lands in PENDING_DOCUMENTS; after
    // the readiness evaluator auto-promotes (score=100), it flips to
    // READY_FOR_REVIEW. Either is a valid post-condition on read.
    expect(body.total).toBeGreaterThan(0);
    expect(body.loads.length).toBeGreaterThan(0);

    const seeded = body.loads.find((l) => l.loadId === setup.loadId);
    expect(seeded).toBeDefined();
    expect(seeded?.status).toBe('DELIVERED');
    expect(['PENDING_DOCUMENTS', 'READY_FOR_REVIEW', 'APPROVED']).toContain(seeded?.billingStatus);
    expect(seeded?.loadNumber).toBe(setup.loadNumber);

    // Persistence: the same row appears on a second read — the service
    // includes no caching on `list`, but the `summary` endpoint does, so we
    // re-read via the summary endpoint as a secondary check that the counts
    // reflect at least one row in the tracked buckets.
    const summaryRes = await asDispatcher.get('/close-out/summary');
    expect(summaryRes.status()).toBe(200);
    const summary = await summaryRes.json();
    expect(summary.total).toBeGreaterThanOrEqual(1);
  });

  // 3 ── GET /close-out/:loadId/readiness ──────────────────────────
  test('GET /close-out/:loadId/readiness evaluates billing readiness @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createDeliveredLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/close-out/${setup.loadId}/readiness`);
    expect(res.status()).toBe(200);
    const readiness = expectContract(
      BillingReadinessResponseSchema.strict(),
      await res.json(),
      'GET /close-out/:id/readiness',
    );

    // Semantic: a fresh DELIVERED load without BOL/POD uploads cannot be
    // approved. Score < 100, readyToApprove false, items cover at least one
    // check category. Individual check statuses (billable_charge, BOL, POD)
    // vary by tenant settings + seeded load fields, so we don't pin specific
    // statuses — only the overall readiness semantics.
    expect(readiness.score).toBeLessThan(100);
    expect(readiness.readyToApprove).toBe(false);
    expect(readiness.totalRequired).toBeGreaterThan(0);
    expect(readiness.totalSatisfied).toBeLessThan(readiness.totalRequired);
    expect(readiness.items.length).toBeGreaterThan(0);

    // Persistence: unknown loadId → 404 (service throws NotFoundException).
    const missingRes = await asDispatcher.get('/close-out/LOAD-does-not-exist-xyz/readiness');
    expect(missingRes.status()).toBe(404);
  });

  // 4 ── POST /close-out/:loadId/approve ───────────────────────────
  test('POST /close-out/:loadId/approve promotes billingStatus to APPROVED via override @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // The default tenant has `allowBillingOverride: false`. A fresh DELIVERED
    // load has readiness < 100. Flip the flag for this test so the override
    // path exercises the real approve logic. Restored in-test.
    const { restore } = await withBillingOverrideEnabled(asAdmin);

    try {
      const setup = await createDeliveredLoad(asDispatcher, asAdmin);
      createdLoadIds.push(setup.loadId);
      createdDriverIds.push(setup.driverPublicId);

      const payload = buildApproveForBilling({
        overrideReason: 'QA Phase 2 Group 2a — approve-with-override happy path coverage',
      });
      const res = await asDispatcher.post(`/close-out/${setup.loadId}/approve`, payload);
      expect(res.status()).toBe(201);
      const body = expectContract(
        ApproveForBillingResponseSchema.strict(),
        await res.json(),
        'POST /close-out/:id/approve',
      );

      // Semantic
      expect(body.loadId).toBe(setup.loadId);
      expect(body.billingStatus).toBe('APPROVED');

      // Persistence — the close-out list row reflects the new billingStatus.
      // Scoped via `?search` to keep our row on page 1 regardless of tenant size.
      const listRes = await asDispatcher.get(`/close-out?search=${encodeURIComponent(setup.loadNumber)}`);
      expect(listRes.status()).toBe(200);
      const list = expectContract(CloseOutListResponseSchema.strict(), await listRes.json());
      const row = list.loads.find((l) => l.loadId === setup.loadId);
      expect(row).toBeDefined();
      expect(row?.billingStatus).toBe('APPROVED');

      // Idempotency guard — second approve call must be rejected because
      // the load is already APPROVED (service throws 400 "already approved").
      const againRes = await asDispatcher.post(`/close-out/${setup.loadId}/approve`, payload);
      expect(againRes.status()).toBe(400);
    } finally {
      await restore();
    }
  });

  // 5 ── POST /close-out/:loadId/send-back ─────────────────────────
  test('POST /close-out/:loadId/send-back reverses APPROVED → READY_FOR_REVIEW @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const { restore } = await withBillingOverrideEnabled(asAdmin);

    try {
      const setup = await createDeliveredLoad(asDispatcher, asAdmin);
      createdLoadIds.push(setup.loadId);
      createdDriverIds.push(setup.driverPublicId);

      // Precondition: approve the load first — send-back only accepts APPROVED
      // loads (service throws 400 "Load is not in approved status" otherwise).
      const approveRes = await asDispatcher.post(
        `/close-out/${setup.loadId}/approve`,
        buildApproveForBilling({
          overrideReason: 'QA Phase 2 Group 2a — precondition for send-back coverage',
        }),
      );
      expect(approveRes.status()).toBe(201);

      // Send-back
      const payload = buildSendBackPayload({
        reason: 'QA Phase 2 Group 2a — charges need another pass before invoicing',
      });
      const res = await asDispatcher.post(`/close-out/${setup.loadId}/send-back`, payload);
      expect(res.status()).toBe(201);
      const body = expectContract(SendBackResponseSchema.strict(), await res.json(), 'POST /close-out/:id/send-back');

      // Semantic
      expect(body.loadId).toBe(setup.loadId);
      expect(body.billingStatus).toBe('READY_FOR_REVIEW');

      // Persistence — list row echoes the reverted billingStatus. Scoped via
      // `?search` to keep our row on page 1.
      const listRes = await asDispatcher.get(`/close-out?search=${encodeURIComponent(setup.loadNumber)}`);
      expect(listRes.status()).toBe(200);
      const list = expectContract(CloseOutListResponseSchema.strict(), await listRes.json());
      const row = list.loads.find((l) => l.loadId === setup.loadId);
      expect(row).toBeDefined();
      expect(row?.billingStatus).toBe('READY_FOR_REVIEW');

      // Second send-back must be rejected (load is no longer APPROVED).
      const againRes = await asDispatcher.post(`/close-out/${setup.loadId}/send-back`, payload);
      expect(againRes.status()).toBe(400);
    } finally {
      await restore();
    }
  });
});

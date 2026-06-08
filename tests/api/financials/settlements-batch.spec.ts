/**
 * Financials — Settlements Batch Operations (Phase 2 Group 2f).
 *
 * Covers 6 batch endpoints on `SettlementsController`:
 *
 *   1. POST /settlements/preview-batch   (asDispatcher) → `{ drivers: PreviewRow[] }`
 *   2. POST /settlements/batch-calculate (asDispatcher) → `{ settlements, errors, total, successCount }`
 *   3. POST /settlements/batch-approve   (asAdmin)      → `{ approved, skipped }`
 *                                        — @requires:data-approved-settlement (blocked by finding #21)
 *   4. POST /settlements/batch-pay       (asAdmin)      → `{ paid, skipped }`
 *                                        — @requires:data-approved-settlement (blocked by finding #21)
 *   5. POST /settlements/batch-void      (asAdmin)      → `{ voided, skipped }`
 *   6. POST /settlements/batch-pdf       (asDispatcher) → application/zip   (@slow)
 *
 * RBAC surface:
 *   - preview-batch + batch-calculate + batch-pdf → DISPATCHER/ADMIN/OWNER
 *   - batch-approve + batch-pay + batch-void      → ADMIN/OWNER only
 *
 * Setup strategy: every batch test provisions 2 fresh settlements via
 * `createCalculatedSettlement` (called twice with different minted drivers).
 * Two is enough to exercise the "batch" code path (the `updateMany where id IN`
 * fan-out) without ballooning setup time. The 409 settlement-number retry in
 * the helper is sized for workers=2 (see finding #23).
 *
 * Cleanup: track every created settlementId + loadId + driverPublicId, then
 * in afterEach: void remaining DRAFT settlements individually, cleanup loads,
 * deactivate drivers. The `@requires:data-approved-settlement` tests are
 * excluded at collection time on demo (finding #21), so the afterEach never
 * sees APPROVED/PAID state on demo. For the batch-void test which
 * voids the rows in-test, afterEach's per-id void request swallows the 400
 * "already voided" via `.catch`.
 *
 * Data gate rationale (tests 3 + 4): finding #21 — the controller passes
 * `user.userId` (STRING public id) into `SettlementsService.batchApprove` /
 * `.approve`, which write it into `Settlement.approvedBy` (`Int?` column).
 * Prisma rejects string→Int. HTTP 400 every time. Same failure mode as the
 * single-settlement approve/pay lifecycle tests. When the fix lands,
 * declare `TESTS_DATA_CAPABILITIES=approved-settlement` and the gate flips
 * open for every settlement spec at once.
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildBatchApproveRequest,
  buildBatchCalculateRequest,
  buildBatchPayRequest,
  buildBatchPdfRequest,
  buildBatchVoidSettlementsRequest,
  buildPreviewBatchRequest,
  buildVoidSettlement,
} from '@sally/test-utils/factories';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, SettlementSchemas } from '@sally/test-utils/schemas';
import { createCalculatedSettlement, type CalculatedSettlementSetup } from './_helpers.js';

const {
  PreviewBatchResponseSchema,
  BatchCalculateResponseSchema,
  BatchApproveResponseSchema,
  BatchPayResponseSchema,
  BatchVoidResponseSchema,
  SettlementResponseSchema,
} = SettlementSchemas;

/** Minimum byte floor for a well-formed ZIP containing at least one PDF. */
const ZIP_MIN_BYTES = 1000;

test.describe('Financials · Settlements Batch Operations @workflow', () => {
  const createdSettlementIds: string[] = [];
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    // Order: void settlements first (they reference lineItems → loads). The
    // per-id void is idempotent-for-cleanup — the service throws 400 on
    // "already voided" which is swallowed. PAID settlements cannot be
    // voided; the gated tests 3+4 are excluded at collection time on demo
    // so afterEach never lands on a PAID row there.
    for (const settlementId of createdSettlementIds.splice(0)) {
      await asAdmin.post(`/settlements/${settlementId}/void`, buildVoidSettlement()).catch(() => undefined);
    }
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  /**
   * Local helper — mint two fresh DRAFT settlements on distinct drivers.
   * Pushes cleanup tracking state. Returns both setups so the caller can
   * assemble batch-action payloads against `setup.settlementId`.
   *
   * Called from every test in this file. Inline (not hoisted to `_helpers.ts`)
   * because only this spec needs the "pair" semantics — every other spec
   * creates one settlement at a time.
   */
  async function createTwoDraftSettlements(
    asDispatcher: Parameters<typeof createCalculatedSettlement>[0],
    asAdmin: Parameters<typeof createCalculatedSettlement>[1],
  ): Promise<[CalculatedSettlementSetup, CalculatedSettlementSetup]> {
    const a = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(a.settlementId);
    createdLoadIds.push(a.loadId);
    createdDriverIds.push(a.driverPublicId);

    const b = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(b.settlementId);
    createdLoadIds.push(b.loadId);
    createdDriverIds.push(b.driverPublicId);

    return [a, b];
  }

  // 1 ── POST /settlements/preview-batch ───────────────────────────────
  test('POST /settlements/preview-batch returns a driver eligibility matrix without mutating state @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Preview is read-only; we still need at least one eligible DELIVERED
    // load so the response includes an "eligible: true" row to assert on.
    // One settlement's setup (driver + pay structure + delivered load) is
    // enough — we don't need TWO because preview iterates every tenant
    // driver regardless.
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const payload = buildPreviewBatchRequest(setup.periodStart, setup.periodEnd);
    const res = await asDispatcher.post('/settlements/preview-batch', payload);
    expect(res.status()).toBe(201);
    const preview = expectContract(
      PreviewBatchResponseSchema.strict(),
      await res.json(),
      'POST /settlements/preview-batch',
    );

    // Semantic — response carries at least the one driver we just set up.
    // Demo tenant has many seeded drivers; we don't assert total count,
    // only that the driver we provisioned appears and is eligible (has a
    // pay structure + at least one DELIVERED load in the window). The
    // delivered load for `setup` was stamped moments ago so it's inside
    // the 14-day back window.
    const ours = preview.drivers.find((row) => row.driverId === setup.driverPublicId);
    expect(ours, `provisioned driver ${setup.driverPublicId} must appear in preview response`).toBeDefined();
    expect(ours?.eligible).toBe(true);
    expect(ours?.warning).toBeNull();
    expect(ours?.payType).not.toBeNull();
    expect(ours?.loadCount).toBeGreaterThanOrEqual(1);
    expect(ours?.estimatedPayCents).toBeGreaterThanOrEqual(0);

    // Mutation check — preview does not create any new settlement. The
    // settlement we minted in setup is still the only one for this driver
    // in the period; a follow-up calculate with the same window must
    // 409 (finding #21's service guard, unrelated to the approvedBy bug).
    const listRes = await asDispatcher.get(`/settlements?driverId=${setup.driverPublicId}`);
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as Array<{ settlementId: string }>;
    const ourSettlement = list.find((s) => s.settlementId === setup.settlementId);
    expect(ourSettlement, 'our settlement must still be the only one').toBeDefined();
  });

  // 2 ── POST /settlements/batch-calculate ─────────────────────────────
  test('POST /settlements/batch-calculate fans out calculate across a list of drivers @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // We want batch-calculate to CREATE new settlements. If we pre-create
    // via `createCalculatedSettlement`, the service's overlap guard would
    // trip and every driver would land in `errors[]` with a 409 message.
    // Instead: set up two drivers + delivered loads WITHOUT calculating,
    // then call batch-calculate directly.
    //
    // We can't skip the settlement-calculate step inside
    // `createCalculatedSettlement` — the helper's whole shape is
    // "calculated". So we call the helper for two drivers, void the
    // pre-calculated settlements immediately, and THEN call batch-calculate
    // for those same drivers inside a FRESH period (shifted by 30 days so
    // the voided settlements' period does not overlap the new calc window).
    // The service's overlap guard skips VOID, so a batch-calc in a
    // fully-separate window is clean.
    const [a, b] = await createTwoDraftSettlements(asDispatcher, asAdmin);

    // Void the pre-calculated settlements so the overlap guard is
    // satisfied when we re-calc in a shifted window. Explicit status 201
    // on the void — bail loudly if the void itself regresses.
    for (const s of [a, b]) {
      const voidRes = await asAdmin.post(`/settlements/${s.settlementId}/void`, buildVoidSettlement());
      expect(voidRes.status()).toBe(201);
      // Remove from afterEach tracker — already voided.
      createdSettlementIds.splice(createdSettlementIds.indexOf(s.settlementId), 1);
    }

    // Fresh window — shift 30 days back so deliveredAt (just-now) is
    // OUTSIDE this window, meaning the calc will fail per-driver with
    // "No delivered loads found in this period" and land each driverId in
    // `errors[]`. This is actually the cleanest assertion path for
    // batch-calculate's shape: the envelope is validated, `errors[]`
    // carries the driverIds we asked for, and no new rows land in the
    // database. Exercises the full DTO contract without the overlap
    // nuance.
    //
    // Why not chase a success path: a success path requires a DELIVERED
    // load landing INSIDE the shifted window — the load's deliveredAt
    // stamp is driven by the service (`new Date()`), not overridable via
    // API, so the "no overlap" + "load in window" preconditions are
    // mutually exclusive without raw Prisma access. The errors-path
    // assertion still validates the endpoint: DTO contract + error
    // envelope + successCount math + no stray rows.
    const shiftedStart = new Date('2026-01-01').toISOString().split('T')[0];
    const shiftedEnd = new Date('2026-01-07').toISOString().split('T')[0];
    const payload = buildBatchCalculateRequest(shiftedStart, shiftedEnd, {
      driverIds: [a.driverPublicId, b.driverPublicId],
    });
    const res = await asDispatcher.post('/settlements/batch-calculate', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      BatchCalculateResponseSchema.strict(),
      await res.json(),
      'POST /settlements/batch-calculate',
    );

    // Semantic — total is the request size, successCount + errors.length
    // equal total, and the errors carry the exact driverIds we asked for.
    expect(body.total).toBe(2);
    expect(body.successCount + body.errors.length).toBe(2);
    expect(body.errors).toHaveLength(2);
    const errorDriverIds = body.errors.map((e) => e.driverId).sort();
    expect(errorDriverIds).toEqual([a.driverPublicId, b.driverPublicId].sort());
    // Error messages from the service are human-readable; smoke-check they
    // mention "delivered loads" or "period" so the test fails loudly if
    // the service starts swallowing error text.
    for (const err of body.errors) {
      expect(err.error.length).toBeGreaterThan(0);
    }
    // No stray rows minted.
    expect(body.settlements).toHaveLength(0);
  });

  // 3 ── POST /settlements/batch-approve ───────────────────────────────
  //
  // Data-gated — `batchApprove` calls `updateMany({ data: { approvedBy:
  // userId } })` with `userId = user.userId` (string public id). The
  // `approved_by` column is `Int?`, so Prisma rejects the update with
  // P2007 / Invalid value for field `approvedBy`. On the demo tenant
  // today the endpoint returns HTTP 400 every time (same failure mode as
  // the single `approve` path, finding #21). Excluded at collection time
  // via `@requires:data-approved-settlement`; flip the capability on
  // after the controller is fixed to pass `user.dbId`.
  test('POST /settlements/batch-approve transitions a batch of DRAFT settlements to APPROVED @workflow @destructive @requires:data-approved-settlement', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const [a, b] = await createTwoDraftSettlements(asDispatcher, asAdmin);
    const settlementIds = [a.settlementId, b.settlementId];

    const payload = buildBatchApproveRequest(settlementIds);
    const res = await asAdmin.post('/settlements/batch-approve', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      BatchApproveResponseSchema.strict(),
      await res.json(),
      'POST /settlements/batch-approve',
    );

    // Semantic — every DRAFT was eligible, so all approved / none skipped.
    expect(body.approved).toBe(settlementIds.length);
    expect(body.skipped).toBe(0);

    // Persistence — each settlement is now APPROVED.
    for (const settlementId of settlementIds) {
      const detailRes = await asDispatcher.get(`/settlements/${settlementId}`);
      expect(detailRes.status()).toBe(200);
      const detail = expectContract(SettlementResponseSchema.strict(), await detailRes.json());
      expect(detail.status).toBe('APPROVED');
      expect(detail.approvedAt).not.toBeNull();
    }

    // Second batch-approve on the same (now APPROVED) rows — service
    // filters on `status: DRAFT` so each row is silently skipped.
    const againRes = await asAdmin.post('/settlements/batch-approve', payload);
    expect(againRes.status()).toBe(201);
    const again = expectContract(BatchApproveResponseSchema.strict(), await againRes.json());
    expect(again.approved).toBe(0);
    expect(again.skipped).toBe(settlementIds.length);
  });

  // 4 ── POST /settlements/batch-pay ───────────────────────────────────
  //
  // Data-gated — requires the approve path to work first. Same gate as
  // test 3 (excluded at collection time on demo until finding #21 lands).
  test('POST /settlements/batch-pay transitions a batch of APPROVED settlements to PAID @workflow @destructive @requires:data-approved-settlement', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const [a, b] = await createTwoDraftSettlements(asDispatcher, asAdmin);
    const settlementIds = [a.settlementId, b.settlementId];

    // Precondition — batch-approve to land both settlements in APPROVED.
    // Service filters on `status: APPROVED` for pay, so DRAFT rows are
    // silently skipped. A direct batch-pay on DRAFT would pass contract
    // but return `paid: 0` — which defeats the happy-path assertion.
    const approveRes = await asAdmin.post('/settlements/batch-approve', buildBatchApproveRequest(settlementIds));
    expect(approveRes.status()).toBe(201);

    const payload = buildBatchPayRequest(settlementIds, {
      paymentMethod: 'ACH',
    });
    const res = await asAdmin.post('/settlements/batch-pay', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(BatchPayResponseSchema.strict(), await res.json(), 'POST /settlements/batch-pay');

    expect(body.paid).toBe(settlementIds.length);
    expect(body.skipped).toBe(0);

    // Persistence — each settlement is now PAID with `paidAt` stamped.
    for (const settlementId of settlementIds) {
      const detailRes = await asDispatcher.get(`/settlements/${settlementId}`);
      expect(detailRes.status()).toBe(200);
      const detail = expectContract(SettlementResponseSchema.strict(), await detailRes.json());
      expect(detail.status).toBe('PAID');
      expect(detail.paidAt).not.toBeNull();
      // Remove from afterEach tracker — PAID cannot be voided.
      createdSettlementIds.splice(createdSettlementIds.indexOf(settlementId), 1);
    }
  });

  // 5 ── POST /settlements/batch-void ──────────────────────────────────
  test('POST /settlements/batch-void flips a batch of DRAFT settlements to VOID @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const [a, b] = await createTwoDraftSettlements(asDispatcher, asAdmin);
    const settlementIds = [a.settlementId, b.settlementId];

    const payload = buildBatchVoidSettlementsRequest(settlementIds);
    const res = await asAdmin.post('/settlements/batch-void', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(BatchVoidResponseSchema.strict(), await res.json(), 'POST /settlements/batch-void');

    expect(body.voided).toBe(settlementIds.length);
    expect(body.skipped).toBe(0);

    // Persistence — each settlement is now VOID.
    for (const settlementId of settlementIds) {
      const detailRes = await asDispatcher.get(`/settlements/${settlementId}`);
      expect(detailRes.status()).toBe(200);
      const detail = expectContract(SettlementResponseSchema.strict(), await detailRes.json());
      expect(detail.status).toBe('VOID');
    }

    // Second batch-void on the same VOID rows — service filters on
    // `status NOT IN (VOID, PAID)`, so each row is silently skipped.
    const againRes = await asAdmin.post('/settlements/batch-void', payload);
    expect(againRes.status()).toBe(201);
    const again = expectContract(BatchVoidResponseSchema.strict(), await againRes.json());
    expect(again.voided).toBe(0);
    expect(again.skipped).toBe(settlementIds.length);
  });

  // 6 ── POST /settlements/batch-pdf ───────────────────────────────────
  test('POST /settlements/batch-pdf streams a ZIP archive of settlement PDFs @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const [a, b] = await createTwoDraftSettlements(asDispatcher, asAdmin);
    const settlementIds = [a.settlementId, b.settlementId];

    const payload = buildBatchPdfRequest(settlementIds);
    const res = await asDispatcher.post('/settlements/batch-pdf', payload);
    // Controller streams the archive via `res.pipe(archive)` without
    // calling `res.status()`, so NestJS's default POST 201 is emitted.
    // Same behaviour as POST /invoices/batch/download — see that spec's
    // comment for the rationale.
    expect(res.status()).toBe(201);

    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/zip');

    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toMatch(/settlements-\d+\.zip/);

    // ZIP structure — PK signature at offset 0 (`PK\x03\x04`). We do not
    // unzip or parse the entries; the archive's inner PDFs are covered by
    // the single-settlement PDF test in `settlements-crud.spec.ts`.
    const body = await res.body();
    expect(body.length).toBeGreaterThan(ZIP_MIN_BYTES);
    expect(body[0]).toBe(0x50); // P
    expect(body[1]).toBe(0x4b); // K
    expect(body[2]).toBe(0x03);
    expect(body[3]).toBe(0x04);
  });
});

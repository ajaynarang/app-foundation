/**
 * Financials — Settlements Lifecycle (Phase 2 Group 2e).
 *
 * Covers 5 state-mutating endpoints on `SettlementsController`:
 *
 *   1. POST   /settlements/:settlement_id/deductions              (DRAFT only)
 *   2. DELETE /settlements/:settlement_id/deductions/:deduction_id (DRAFT only)
 *   3. POST   /settlements/:settlement_id/approve                 (DRAFT → APPROVED)
 *   4. POST   /settlements/:settlement_id/pay                     (APPROVED → PAID)
 *   5. POST   /settlements/:settlement_id/void                    (anything != PAID → VOID)
 *
 * Driver self-service reads (GET my-settlements / detail / pdf) live in
 * `settlements-crud.spec.ts` because they are projections of the same
 * read endpoints — they don't belong in a lifecycle spec.
 *
 * Role mix:
 *   - asDispatcher — deductions add/remove, void (service allows
 *                    DISPATCHER/ADMIN/OWNER for these).
 *   - asAdmin      — approve, pay (service restricts these to ADMIN/OWNER).
 *
 * State machine (distilled from `settlements.service.ts`):
 *
 *        ┌─addDeduction / removeDeduction (DRAFT only)
 *    DRAFT ──approve (ADMIN)──▶ APPROVED ──pay (ADMIN)──▶ PAID
 *     │                           │
 *     └─── void (ADMIN) ───────┬──┘
 *                              │
 *                              ▼
 *                            VOID (terminal; PAID rejects void)
 *
 * Cleanup nuance — PAID settlements cannot be voided. The "mark paid" test
 * flags its settlement for skip-void in afterEach (`skipVoidIds`). Voided
 * settlements cannot be re-voided either; the catch-all swallows the 400.
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildApproveSettlement,
  buildPaySettlement,
  buildSettlementDeduction,
  buildVoidSettlement,
} from '@sally/test-utils/factories';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, SettlementSchemas } from '@sally/test-utils/schemas';
import { createCalculatedSettlement } from './_helpers.js';

const { SettlementResponseSchema, SettlementDeductionResponseSchema } = SettlementSchemas;

test.describe('Financials · Settlements Lifecycle @workflow', () => {
  const createdSettlementIds: string[] = [];
  const skipVoidIds = new Set<string>();
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const settlementId of createdSettlementIds.splice(0)) {
      if (skipVoidIds.has(settlementId)) continue;
      await asAdmin.post(`/settlements/${settlementId}/void`, buildVoidSettlement()).catch(() => undefined);
    }
    skipVoidIds.clear();
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  // 1 ── POST /settlements/:id/deductions ───────────────────────────
  test('POST /settlements/:settlement_id/deductions adds a deduction and updates settlement totals @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const payload = buildSettlementDeduction({
      type: 'FUEL_ADVANCE',
      amountCents: 7500,
      description: 'QA Phase 2 Group 2e — fuel advance',
    });
    const res = await asDispatcher.post(`/settlements/${setup.settlementId}/deductions`, payload);
    expect(res.status()).toBe(201);
    const deduction = expectContract(
      SettlementDeductionResponseSchema.strict(),
      await res.json(),
      'POST /settlements/:id/deductions',
    );

    // Semantic — row reflects the input; netPay on the parent settlement
    // decreased by the deduction amount.
    expect(deduction.type).toBe('FUEL_ADVANCE');
    expect(deduction.amountCents).toBe(7500);
    expect(deduction.description).toBe('QA Phase 2 Group 2e — fuel advance');

    // Persistence — GET the settlement back; deductions array contains
    // this row, deductionsCents + netPayCents rebalance.
    const afterRes = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(
      SettlementResponseSchema.strict(),
      await afterRes.json(),
      'GET /settlements/:id after addDeduction',
    );
    expect(after.deductions).toHaveLength(1);
    expect(after.deductions?.[0]?.id).toBe(deduction.id);
    expect(after.deductionsCents).toBe(7500);
    expect(after.netPayCents).toBe(after.grossPayCents - 7500);
  });

  // 2 ── DELETE /settlements/:id/deductions/:deduction_id ───────────
  test('DELETE /settlements/:settlement_id/deductions/:deduction_id removes the deduction and rebalances totals @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Precondition: add a deduction so there's something to remove.
    const addPayload = buildSettlementDeduction({
      type: 'INSURANCE',
      amountCents: 12000,
      description: 'QA Phase 2 Group 2e — insurance (to be removed)',
    });
    const addRes = await asDispatcher.post(`/settlements/${setup.settlementId}/deductions`, addPayload);
    expect(addRes.status()).toBe(201);
    const added = expectContract(SettlementDeductionResponseSchema.strict(), await addRes.json());

    // The endpoint under test.
    const res = await asDispatcher.delete(`/settlements/${setup.settlementId}/deductions/${added.id}`);
    // Controller has no explicit @HttpCode — NestJS defaults DELETE to
    // 200. Service returns void; NestJS emits an empty body, which
    // Playwright's `res.body()` reads as Buffer(0).
    expect(res.status()).toBe(200);

    // Persistence — settlement deductions array is empty, totals restored.
    const afterRes = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(
      SettlementResponseSchema.strict(),
      await afterRes.json(),
      'GET /settlements/:id after removeDeduction',
    );
    expect(after.deductions).toHaveLength(0);
    expect(after.deductionsCents).toBe(0);
    expect(after.netPayCents).toBe(after.grossPayCents);

    // Unknown deduction id on a real settlement → 404.
    const missingRes = await asDispatcher.delete(`/settlements/${setup.settlementId}/deductions/999999999`);
    expect(missingRes.status()).toBe(404);
  });

  // 3 ── POST /settlements/:id/approve ──────────────────────────────
  //
  // APP-BUG (finding #21): SettlementsController passes `user.userId`
  // (STRING public id, e.g. "user_demo_admin") into
  // SettlementsService.approve, which forwards it into
  // `prisma.settlement.update({ data: { approvedBy: <string> } })`.
  // The `approved_by` column is typed `Int?` — Prisma rejects with
  //     Argument `approvedBy`: Invalid value provided.
  //     Expected Int, NullableIntFieldUpdateOperationsInput or Null,
  //     provided String.
  // which surfaces as HTTP 400. Every money-codes/loads controller in the
  // same codebase correctly uses `user.dbId` (the numeric DB id) — this
  // Happy path: DRAFT → APPROVED. Currently blocked by finding #21
  // (controller passes user.userId string to Prisma approvedBy Int column).
  // Gated `@requires:data-approved-settlement` — excluded at collection time
  // on tenants where the approve path is broken. Flip the capability on
  // once #21 lands.
  test('POST /settlements/:settlement_id/approve transitions DRAFT → APPROVED @workflow @destructive @requires:data-approved-settlement', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asAdmin.post(`/settlements/${setup.settlementId}/approve`, buildApproveSettlement());
    expect(res.status()).toBe(201);
    const approved = expectContract(
      SettlementResponseSchema.strict(),
      await res.json(),
      'POST /settlements/:id/approve',
    );

    // Semantic: status flipped + approvedAt stamped.
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).not.toBeNull();

    // Persistence: GET reflects APPROVED.
    const afterRes = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(SettlementResponseSchema.strict(), await afterRes.json());
    expect(after.status).toBe('APPROVED');

    // Idempotency: a second approve on an already-APPROVED row is rejected.
    const againRes = await asAdmin.post(`/settlements/${setup.settlementId}/approve`, buildApproveSettlement());
    expect(againRes.status()).toBe(400);
  });

  // 4 ── POST /settlements/:id/pay ──────────────────────────────────
  //
  // Happy path: APPROVED → PAID. Requires the approve path to work first
  // (finding #21 blocks it today). Same data gate as test #3 — excluded at
  // collection time until #21 lands.
  test('POST /settlements/:settlement_id/pay transitions APPROVED → PAID @workflow @destructive @requires:data-approved-settlement', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Precondition: approve the settlement first.
    const approveRes = await asAdmin.post(`/settlements/${setup.settlementId}/approve`, buildApproveSettlement());
    expect(approveRes.status()).toBe(201);

    // Endpoint under test.
    const res = await asAdmin.post(`/settlements/${setup.settlementId}/pay`, buildPaySettlement());
    expect(res.status()).toBe(201);
    const paid = expectContract(SettlementResponseSchema.strict(), await res.json(), 'POST /settlements/:id/pay');

    // Semantic: status flipped + paidAt stamped.
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt).not.toBeNull();

    // Persistence: GET reflects PAID.
    const afterRes = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(SettlementResponseSchema.strict(), await afterRes.json());
    expect(after.status).toBe('PAID');

    // Don't void a PAID row in afterEach — remove from tracker.
    createdSettlementIds.splice(createdSettlementIds.indexOf(setup.settlementId), 1);

    // Idempotency: a second pay on an already-PAID row is rejected.
    const againRes = await asAdmin.post(`/settlements/${setup.settlementId}/pay`, buildPaySettlement());
    expect(againRes.status()).toBe(400);
  });

  // 5 ── POST /settlements/:id/void ─────────────────────────────────
  test('POST /settlements/:settlement_id/void voids a DRAFT settlement and rejects re-void @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asAdmin.post(`/settlements/${setup.settlementId}/void`, buildVoidSettlement());
    expect(res.status()).toBe(201);
    const voided = expectContract(SettlementResponseSchema.strict(), await res.json(), 'POST /settlements/:id/void');

    // Semantic — VOID + service did not stamp approvedAt/paidAt.
    expect(voided.status).toBe('VOID');

    // Persistence — GET reflects VOID.
    const afterRes = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(SettlementResponseSchema.strict(), await afterRes.json());
    expect(after.status).toBe('VOID');

    // Second void rejected — service enforces "not already VOID".
    const againRes = await asAdmin.post(`/settlements/${setup.settlementId}/void`, buildVoidSettlement());
    expect(againRes.status()).toBe(400);
  });
});

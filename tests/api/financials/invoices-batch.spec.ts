/**
 * Financials — Invoicing Batch Operations (Phase 2 Group 2c).
 *
 * Covers 6 batch endpoints on `InvoicingController`:
 *
 *   1. POST /invoices/batch/generate          — BatchGenerateDto      → `{ generated, errors, total, successCount }`
 *   2. POST /invoices/batch/send              — BatchActionDto        → `{ sent, skipped }`
 *   3. POST /invoices/batch/void              — BatchActionDto        → `{ voided, skipped }`
 *   4. POST /invoices/batch/mark-paid         — BatchMarkPaidDto      → `{ paid, skipped }`
 *   5. POST /invoices/batch/download          — BatchActionDto        → application/zip binary
 *   6. POST /invoices/batch/submit-to-factor  — (inline body type)    → `{ submitted, skipped }`
 *                                               (@requires:data-factoring-linked)
 *
 * The legacy POST /invoices/batch/factor was DELETED in Phase 4A. The single
 * submit flow now lives in batch/submit-to-factor (also transitions FACTORED).
 *
 * Role: all 7 endpoints permit DISPATCHER/ADMIN/OWNER → `asDispatcher` is
 * sufficient. `withBillingOverrideEnabled` flips the tenant override flag
 * for setup, which requires `asAdmin`.
 *
 * Setup pattern: each batch test provisions 2-3 fresh invoiceable loads via
 * `createInvoiceableLoad`. The helper returns a DRAFT invoice — for tests
 * that need SENT state (mark-paid) we transition in-test so the invoice
 * existence contract is covered separately by the CRUD spec.
 *
 * Cleanup: track every created loadId + driverPublicId. The afterEach
 * cleanup-loads cascade-removes invoices + line items via the existing
 * `DELETE /loads/:id` path (see `cleanupLoad` in `financials-lifecycle.ts`).
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildBatchGenerateRequest,
  buildBatchSendRequest,
  buildBatchVoidRequest,
  buildBatchMarkPaidRequest,
  buildBatchDownloadRequest,
  buildBatchSubmitToFactorRequest,
  buildApproveForBilling,
} from '@sally/test-utils/factories';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, FactoringSchemas, InvoiceSchemas } from '@sally/test-utils/schemas';
import {
  createDeliveredLoad,
  createInvoiceableLoad,
  withBillingOverrideEnabled,
  type DeliveredLoadSetup,
} from './_helpers.js';

const {
  BatchGenerateResponseSchema,
  BatchSendResponseSchema,
  BatchVoidResponseSchema,
  BatchMarkPaidResponseSchema,
  BatchSubmitToFactorResponseSchema,
} = FactoringSchemas;
const { InvoiceDetailSchema } = InvoiceSchemas;

/** Minimum byte floor for a well-formed ZIP containing at least one PDF. */
const ZIP_MIN_BYTES = 1000;

/**
 * Provision N delivered + billing-approved loads so a subsequent
 * `batchGenerate` can emit N DRAFT invoices. `createInvoiceableLoad`
 * already does delivery + approve + generate — for batch-generate we
 * need delivery + approve WITHOUT an existing invoice, so we re-assemble
 * from the primitive helpers.
 */
async function createApprovedLoadsForBatchGenerate(
  asDispatcher: Parameters<typeof createDeliveredLoad>[0],
  asAdmin: Parameters<typeof createDeliveredLoad>[1],
  count: number,
): Promise<DeliveredLoadSetup[]> {
  const out: DeliveredLoadSetup[] = [];
  for (let i = 0; i < count; i++) {
    const setup = await createDeliveredLoad(asDispatcher, asAdmin);
    const approveRes = await asDispatcher.post(
      `/close-out/${setup.loadId}/approve`,
      buildApproveForBilling({
        overrideReason: `QA Phase 2 Group 2c — batch generate approve #${i + 1}`,
      }),
    );
    expect(approveRes.status()).toBe(201);
    out.push(setup);
  }
  return out;
}

test.describe('Financials · Invoicing Batch Operations @workflow', () => {
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

  // 1 ── POST /invoices/batch/generate ─────────────────────────────────
  test('POST /invoices/batch/generate creates DRAFT invoices for each approved load @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const approved = await createApprovedLoadsForBatchGenerate(asDispatcher, asAdmin, 2);
    for (const s of approved) {
      createdLoadIds.push(s.loadId);
      createdDriverIds.push(s.driverPublicId);
    }

    const payload = buildBatchGenerateRequest(
      approved.map((s) => s.loadId),
      {
        paymentTermsDays: 30,
      },
    );
    const res = await asDispatcher.post('/invoices/batch/generate', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      BatchGenerateResponseSchema.strict(),
      await res.json(),
      'POST /invoices/batch/generate',
    );

    // Semantic: every provisioned load produced an invoice, no errors.
    expect(body.total).toBe(approved.length);
    expect(body.successCount).toBe(approved.length);
    expect(body.generated).toHaveLength(approved.length);
    expect(body.errors).toHaveLength(0);

    // Persistence: pluck each generated invoiceNumber out of the raw array and
    // verify the corresponding GET returns a DRAFT invoice. `generated[]`
    // is typed as unknown in the response schema (avoids circular import);
    // the actual payload is the mutation-flavor Invoice shape — we pick
    // `invoiceNumber` directly.
    const generatedIds = body.generated
      .map((g) => (g as { invoiceNumber?: unknown })?.invoiceNumber)
      .filter((v): v is string => typeof v === 'string');
    expect(generatedIds).toHaveLength(approved.length);

    for (const invoiceId of generatedIds) {
      const detailRes = await asDispatcher.get(`/invoices/${invoiceId}`);
      expect(detailRes.status()).toBe(200);
      const detail = expectContract(InvoiceDetailSchema.strict(), await detailRes.json());
      expect(detail.status).toBe('DRAFT');
      expect(detail.paymentTermsDays).toBe(30);
    }
  });

  // 2 ── POST /invoices/batch/send ─────────────────────────────────────
  test('POST /invoices/batch/send transitions DRAFT invoices to SENT in bulk @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setups = [
      await createInvoiceableLoad(asDispatcher, asAdmin),
      await createInvoiceableLoad(asDispatcher, asAdmin),
    ];
    for (const s of setups) {
      createdLoadIds.push(s.loadId);
      createdDriverIds.push(s.driverPublicId);
    }

    const invoiceIds = setups.map((s) => s.invoiceNumber);
    const payload = buildBatchSendRequest(invoiceIds);
    const res = await asDispatcher.post('/invoices/batch/send', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(BatchSendResponseSchema.strict(), await res.json(), 'POST /invoices/batch/send');

    // Semantic: every DRAFT was eligible, so all sent / none skipped.
    expect(body.sent).toBe(invoiceIds.length);
    expect(body.skipped).toBe(0);

    // Persistence: each invoice now SENT.
    for (const invoiceId of invoiceIds) {
      const afterRes = await asDispatcher.get(`/invoices/${invoiceId}`);
      expect(afterRes.status()).toBe(200);
      const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
      expect(after.status).toBe('SENT');
    }

    // Second batch-send on the same SENT invoices — service filters on
    // `status: DRAFT` so each row is silently skipped (200 envelope, skipped > 0).
    const againRes = await asDispatcher.post('/invoices/batch/send', payload);
    expect(againRes.status()).toBe(201);
    const again = expectContract(BatchSendResponseSchema.strict(), await againRes.json());
    expect(again.sent).toBe(0);
    expect(again.skipped).toBe(invoiceIds.length);
  });

  // 3 ── POST /invoices/batch/void ─────────────────────────────────────
  test('POST /invoices/batch/void voids DRAFT invoices in bulk @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setups = [
      await createInvoiceableLoad(asDispatcher, asAdmin),
      await createInvoiceableLoad(asDispatcher, asAdmin),
    ];
    for (const s of setups) {
      createdLoadIds.push(s.loadId);
      createdDriverIds.push(s.driverPublicId);
    }

    const invoiceIds = setups.map((s) => s.invoiceNumber);
    const payload = buildBatchVoidRequest(invoiceIds);
    const res = await asDispatcher.post('/invoices/batch/void', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(BatchVoidResponseSchema.strict(), await res.json(), 'POST /invoices/batch/void');

    expect(body.voided).toBe(invoiceIds.length);
    expect(body.skipped).toBe(0);

    for (const invoiceId of invoiceIds) {
      const afterRes = await asDispatcher.get(`/invoices/${invoiceId}`);
      expect(afterRes.status()).toBe(200);
      const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
      expect(after.status).toBe('VOID');
    }
  });

  // 4 ── POST /invoices/batch/mark-paid ────────────────────────────────
  test('POST /invoices/batch/mark-paid records full payments on SENT invoices and flips them to PAID @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setups = [
      await createInvoiceableLoad(asDispatcher, asAdmin),
      await createInvoiceableLoad(asDispatcher, asAdmin),
    ];
    for (const s of setups) {
      createdLoadIds.push(s.loadId);
      createdDriverIds.push(s.driverPublicId);
    }

    // Precondition: batchMarkPaid filters on `status IN (SENT, PARTIAL)`;
    // a DRAFT invoice would be silently skipped. Send each individually
    // so we're exercising batch mark-paid, not batch-send-then-mark-paid.
    const invoiceIds = setups.map((s) => s.invoiceNumber);
    for (const invoiceId of invoiceIds) {
      const sendRes = await asDispatcher.post(`/invoices/${invoiceId}/send`, {});
      expect(sendRes.status()).toBe(201);
    }

    const payload = buildBatchMarkPaidRequest(invoiceIds, {
      paymentMethod: 'ACH',
      // paymentDate defaults to today; backend rejects future dates.
    });
    const res = await asDispatcher.post('/invoices/batch/mark-paid', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      BatchMarkPaidResponseSchema.strict(),
      await res.json(),
      'POST /invoices/batch/mark-paid',
    );

    expect(body.paid).toBe(invoiceIds.length);
    expect(body.skipped).toBe(0);

    // Persistence: each invoice now PAID with a payment row of full balance.
    for (const invoiceId of invoiceIds) {
      const afterRes = await asDispatcher.get(`/invoices/${invoiceId}`);
      expect(afterRes.status()).toBe(200);
      const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
      expect(after.status).toBe('PAID');
      expect(after.balanceCents).toBe(0);
      expect(after.paidCents).toBe(after.totalCents);
      expect(after.payments.length).toBe(1);
      expect(after.payments[0].paymentMethod).toBe('ACH');
    }
  });

  // 5 ── POST /invoices/batch/download ─────────────────────────────────
  test('POST /invoices/batch/download streams a ZIP archive of invoice PDFs @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setups = [
      await createInvoiceableLoad(asDispatcher, asAdmin),
      await createInvoiceableLoad(asDispatcher, asAdmin),
    ];
    for (const s of setups) {
      createdLoadIds.push(s.loadId);
      createdDriverIds.push(s.driverPublicId);
    }

    const payload = buildBatchDownloadRequest(setups.map((s) => s.invoiceNumber));
    const res = await asDispatcher.post('/invoices/batch/download', payload);
    // POST default on NestJS is 201 — even when the controller streams a
    // binary via `res.pipe(archive)` the status code stays 201 unless the
    // handler calls `res.status(200)` explicitly (which `batchDownload`
    // does not). The response is a well-formed ZIP either way; we just
    // assert the actual emitted status.
    expect(res.status()).toBe(201);

    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/zip');

    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toMatch(/invoices-\d+\.zip/);

    // ZIP structure — PK signature at offset 0 (`PK\x03\x04`).
    const body = await res.body();
    expect(body.length).toBeGreaterThan(ZIP_MIN_BYTES);
    expect(body[0]).toBe(0x50); // P
    expect(body[1]).toBe(0x4b); // K
    expect(body[2]).toBe(0x03);
    expect(body[3]).toBe(0x04);
  });

  // 6 ── POST /invoices/batch/submit-to-factor ─────────────────────────
  test('POST /invoices/batch/submit-to-factor records factor submission on a SENT+FACTORED batch @workflow @destructive @requires:data-factoring-linked', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Data gate — see `tests/config/detect-capabilities.ts` entry
    // `factoring-linked`. Demo tenant does not seed this today; when
    // TESTS_DATA_CAPABILITIES=factoring-linked is present this test runs.
    await withBillingOverrideEnabled(asAdmin);
    const setups = [
      await createInvoiceableLoad(asDispatcher, asAdmin),
      await createInvoiceableLoad(asDispatcher, asAdmin),
    ];
    for (const s of setups) {
      createdLoadIds.push(s.loadId);
      createdDriverIds.push(s.driverPublicId);
    }

    const invoiceIds = setups.map((s) => s.invoiceNumber);
    for (const invoiceId of invoiceIds) {
      const sendRes = await asDispatcher.post(`/invoices/${invoiceId}/send`, {});
      expect(sendRes.status()).toBe(201);
    }

    // Discover a factoring company on the tenant.
    const companiesRes = await asDispatcher.get('/invoices/factoring-companies');
    expect(companiesRes.status()).toBe(200);
    const companies = (await companiesRes.json()) as Array<{
      companyId: string;
    }>;
    expect(
      companies.length,
      'tenant declares @requires:data-factoring-linked but /invoices/factoring-companies returned 0 rows',
    ).toBeGreaterThan(0);
    const companyId = companies[0].companyId;

    const payload = buildBatchSubmitToFactorRequest(invoiceIds, companyId, {
      factoringReference: 'QA-PHASE-2C-BATCH-SUBMIT',
      sendEmail: false,
    });
    const res = await asDispatcher.post('/invoices/batch/submit-to-factor', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      BatchSubmitToFactorResponseSchema.strict(),
      await res.json(),
      'POST /invoices/batch/submit-to-factor',
    );

    // Semantic: submitted + skipped = requested. With a properly
    // factoring-linked tenant every invoice should submit successfully.
    expect(body.submitted + body.skipped).toBe(invoiceIds.length);
    expect(body.submitted).toBe(invoiceIds.length);

    // Persistence: each invoice now carries the factoringReference +
    // submittedToFactorAt timestamp. Status does NOT change (submit-to-factor
    // is a non-destructive marker; factor() — next test — hard-flips status).
    for (const invoiceId of invoiceIds) {
      const afterRes = await asDispatcher.get(`/invoices/${invoiceId}`);
      expect(afterRes.status()).toBe(200);
      const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
      expect(after.factoringReference).toBe('QA-PHASE-2C-BATCH-SUBMIT');
      expect(after.submittedToFactorAt).not.toBeNull();
    }
  });

  // 7 ── POST /invoices/batch/factor (legacy) ──────────────────────────
  // Legacy POST /invoices/batch/factor was DELETED in Phase 4A.
  // Use POST /invoices/batch/submit-to-factor (now also transitions
  // SENT → FACTORED) — covered by the batch submit-to-factor case above.
});

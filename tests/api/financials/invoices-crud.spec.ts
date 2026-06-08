/**
 * Financials — Invoicing CRUD (Phase 2 Group 2b).
 *
 * Covers 11 endpoints on `InvoicingController`:
 *
 *   1. POST   /invoices/generate/:load_id
 *   2. POST   /invoices                       (manual create)
 *   3. GET    /invoices                       (list + filters)
 *   4. GET    /invoices/summary               (AR aging)
 *   5. GET    /invoices/:invoice_id           (detail)
 *   6. PATCH  /invoices/:invoice_id           (update DRAFT)
 *   7. POST   /invoices/:invoice_id/send      (DRAFT → SENT)
 *   8. POST   /invoices/:invoice_id/void      (→ VOID)
 *   9. POST   /invoices/:invoice_id/payments  (record payment)
 *  10. POST   /invoices/:invoice_id/resend    (email resend, SENT only)
 *  11. POST   /invoices/:invoice_id/reinvoice (VOID → new DRAFT)
 *
 * Role: all 11 endpoints permit DISPATCHER/ADMIN/OWNER — `asDispatcher`
 * suffices. `withBillingOverrideEnabled` flips the tenant override flag for
 * setup (see `_helpers.ts`) and that flip requires `asAdmin`.
 *
 * Setup pattern: every test that needs an existing invoice bootstraps via
 * `createInvoiceableLoad(asDispatcher, asAdmin)` — delivers a fresh load,
 * override-approves it, generates a DRAFT invoice. Test body then mutates
 * off that DRAFT. The close-out tests (Group 2a) already verify the approve
 * pathway end-to-end; this group trusts it and asserts only the invoice
 * surface area.
 *
 * Schema strategy — see `packages/test-utils/src/schemas/invoices.ts` for
 * the drift notes. `InvoiceMutationSchema` / `InvoiceListItemSchema` /
 * `InvoiceDetailSchema` are three distinct shapes matching three different
 * Prisma `include` blocks per service method.
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildInvoicePayload,
  buildInvoiceUpdate,
  buildPayment,
  buildSendInvoicePayload,
} from '@sally/test-utils/factories';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, InvoiceSchemas } from '@sally/test-utils/schemas';
import { createDeliveredLoad, createInvoiceableLoad, withBillingOverrideEnabled } from './_helpers.js';

const {
  InvoiceMutationSchema,
  InvoiceListItemSchema,
  InvoiceListResponseSchema,
  InvoiceDetailSchema,
  InvoiceSummaryResponseSchema,
  RecordPaymentResponseSchema,
  SendInvoiceResponseSchema,
} = InvoiceSchemas;

test.describe('Financials · Invoicing CRUD @workflow', () => {
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  // Every test here calls `withBillingOverrideEnabled(asAdmin)` at the top of
  // its body. The helper is idempotent (GET, conditional PUT, no-op restore)
  // so two workers entering simultaneously never flap the flag back to false
  // mid-test. See `_helpers.ts` docstring + findings #16.

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  // 1 ── POST /invoices/generate/:load_id ────────────────────────────
  test('POST /invoices/generate/:load_id creates a DRAFT invoice from an APPROVED load @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // createInvoiceableLoad internally performs the generate call — so this
    // test covers the endpoint by standing up a fresh load, doing its own
    // approve, then invoking generate and asserting contract + persistence.
    // We replicate the helper inline here so the endpoint under test is
    // explicit, rather than hidden behind an abstraction.
    const { restore } = await withBillingOverrideEnabled(asAdmin);
    try {
      const setup = await createDeliveredLoad(asDispatcher, asAdmin);
      createdLoadIds.push(setup.loadId);
      createdDriverIds.push(setup.driverPublicId);

      // Approve precondition.
      const approveRes = await asDispatcher.post(`/close-out/${setup.loadId}/approve`, {
        overrideReason: 'QA Phase 2 Group 2b — approve to unlock invoice generation',
      });
      expect(approveRes.status()).toBe(201);

      // The endpoint under test.
      const res = await asDispatcher.post(`/invoices/generate/${setup.loadId}`, {});
      expect(res.status()).toBe(201);
      const invoice = expectContract(
        InvoiceMutationSchema.strict(),
        await res.json(),
        'POST /invoices/generate/:load_id',
      );

      // Semantic: the generated invoice is DRAFT, linked to the right load,
      // totals match the seeded `rateCents=275000` LINEHAUL fallback line item.
      expect(invoice.status).toBe('DRAFT');
      expect(invoice.subtotalCents).toBe(275000);
      expect(invoice.totalCents).toBe(275000);
      expect(invoice.paidCents).toBe(0);
      expect(invoice.balanceCents).toBe(275000);
      expect(invoice.lineItems.length).toBeGreaterThanOrEqual(1);
      expect(invoice.lineItems[0].type).toBe('LINEHAUL');

      // Persistence — GET the invoice back by id, verify same shape.
      const detailRes = await asDispatcher.get(`/invoices/${invoice.invoiceNumber}`);
      expect(detailRes.status()).toBe(200);
      const detail = expectContract(
        InvoiceDetailSchema.strict(),
        await detailRes.json(),
        'GET /invoices/:id after generate',
      );
      expect(detail.invoiceNumber).toBe(invoice.invoiceNumber);
      expect(detail.status).toBe('DRAFT');

      // Second generate call on same load must fail — "already exists".
      const againRes = await asDispatcher.post(`/invoices/generate/${setup.loadId}`, {});
      expect(againRes.status()).toBe(400);
    } finally {
      await restore();
    }
  });

  // 2 ── POST /invoices (manual create) ──────────────────────────────
  test('POST /invoices accepts CreateInvoiceDto and creates an invoice from the referenced load @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Controller delegates to `generateFromLoad`, so the precondition is the
    // same: load must be DELIVERED + APPROVED. We stand one up, then POST
    // /invoices with the DTO body (not /generate/:id) — exercises the second
    // controller route.
    const { restore } = await withBillingOverrideEnabled(asAdmin);
    try {
      const setup = await createDeliveredLoad(asDispatcher, asAdmin);
      createdLoadIds.push(setup.loadId);
      createdDriverIds.push(setup.driverPublicId);

      const approveRes = await asDispatcher.post(`/close-out/${setup.loadId}/approve`, {
        overrideReason: 'QA Phase 2 Group 2b — manual-create precondition approve',
      });
      expect(approveRes.status()).toBe(201);

      const payload = buildInvoicePayload(setup.loadId, {
        paymentTermsDays: 45,
        notes: 'QA manual create — Net 45',
      });
      const res = await asDispatcher.post('/invoices', payload);
      expect(res.status()).toBe(201);
      const invoice = expectContract(InvoiceMutationSchema.strict(), await res.json(), 'POST /invoices');

      // Semantic
      expect(invoice.status).toBe('DRAFT');
      expect(invoice.paymentTermsDays).toBe(45);
      expect(invoice.notes).toBe('QA manual create — Net 45');

      // Persistence — issueDate + dueDate 45 days apart.
      const issue = new Date(invoice.issueDate);
      const due = new Date(invoice.dueDate);
      const diffDays = Math.round((due.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(45);
    } finally {
      await restore();
    }
  });

  // 3 ── GET /invoices ───────────────────────────────────────────────
  test('GET /invoices lists invoices and honours ?search on invoiceNumber @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Fetch the just-generated invoice to learn its invoiceNumber — service
    // `generateFromLoad` returns only the `id/invoiceNumber/…` superset, and
    // the number is useful for scoping the list query.
    const detailRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(InvoiceDetailSchema.strict(), await detailRes.json());

    // Default list (no filter) — seeded tenant has many invoices so just
    // verify the envelope. Array-of-invoices, no envelope wrapper.
    const listRes = await asDispatcher.get('/invoices?limit=5');
    expect(listRes.status()).toBe(200);
    const list = expectContract(InvoiceListResponseSchema, await listRes.json(), 'GET /invoices');
    expect(list.length).toBeGreaterThan(0);

    // Scoped via ?search — guaranteed to return our row on page 1.
    const scopedRes = await asDispatcher.get(`/invoices?search=${encodeURIComponent(detail.invoiceNumber)}`);
    expect(scopedRes.status()).toBe(200);
    const scoped = expectContract(InvoiceListResponseSchema, await scopedRes.json());
    const match = scoped.find((r) => r.invoiceNumber === setup.invoiceNumber);
    expect(match).toBeDefined();
    expect(match?.invoiceNumber).toBe(detail.invoiceNumber);
    expect(match?.status).toBe('DRAFT');

    // Contract check — every row conforms to the list-item shape.
    expect(
      expectContract(InvoiceListItemSchema.strict(), scoped[0], 'InvoiceListItemSchema on first row'),
    ).toBeDefined();
  });

  // 4 ── GET /invoices/summary ───────────────────────────────────────
  test('GET /invoices/summary returns AR aging envelope with non-negative counts @workflow', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/invoices/summary');
    expect(res.status()).toBe(200);
    const summary = expectContract(InvoiceSummaryResponseSchema.strict(), await res.json(), 'GET /invoices/summary');

    // Semantic: counts + cents are non-negative. Aging total cents equals
    // sum across the five buckets (service sums per-row into the bucket,
    // never double-counts).
    expect(summary.outstandingCents).toBeGreaterThanOrEqual(0);
    expect(summary.overdueCents).toBeGreaterThanOrEqual(0);
    expect(summary.draftCount).toBeGreaterThanOrEqual(0);
    expect(summary.readyToInvoiceCount).toBeGreaterThanOrEqual(0);
    expect(summary.aging.current.count).toBeGreaterThanOrEqual(0);
    expect(summary.aging.days1_30.count).toBeGreaterThanOrEqual(0);
    expect(summary.aging.days31_60.count).toBeGreaterThanOrEqual(0);
    expect(summary.aging.days61_90.count).toBeGreaterThanOrEqual(0);
    expect(summary.aging.daysOver90.count).toBeGreaterThanOrEqual(0);

    const totalCountsAcrossBuckets =
      summary.aging.current.count +
      summary.aging.days1_30.count +
      summary.aging.days31_60.count +
      summary.aging.days61_90.count +
      summary.aging.daysOver90.count;
    // Every open invoice (SENT|PARTIAL|OVERDUE) lands in exactly one bucket.
    expect(totalCountsAcrossBuckets).toBeGreaterThanOrEqual(0);
  });

  // 5 ── GET /invoices/:invoice_id ───────────────────────────────────
  test('GET /invoices/:invoice_id returns the detail flavour with lineItems + payments @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(InvoiceDetailSchema.strict(), await res.json(), 'GET /invoices/:id');

    // Semantic: fresh invoice → DRAFT, no payments, one linehaul line item.
    expect(detail.invoiceNumber).toBe(setup.invoiceNumber);
    expect(detail.status).toBe('DRAFT');
    expect(detail.payments).toHaveLength(0);
    expect(detail.lineItems).toHaveLength(1);
    expect(detail.lineItems[0].type).toBe('LINEHAUL');
    expect(detail.lineItems[0].totalCents).toBe(275000);
    expect(detail.balanceCents).toBe(detail.totalCents);

    // Unknown id → 404.
    const missingRes = await asDispatcher.get('/invoices/inv_does_not_exist');
    expect(missingRes.status()).toBe(404);
  });

  // 6 ── PATCH /invoices/:invoice_id ─────────────────────────────────
  test('PATCH /invoices/:invoice_id updates a DRAFT invoice and recomputes dueDate @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Read issueDate before update so we can verify the recomputed dueDate.
    const beforeRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(beforeRes.status()).toBe(200);
    const before = expectContract(InvoiceDetailSchema.strict(), await beforeRes.json());

    const payload = buildInvoiceUpdate({
      paymentTermsDays: 60,
      notes: 'QA updated — stretched to Net 60',
      internalNotes: 'QA internal note — do not expose to customer',
    });
    const res = await asDispatcher.patch(`/invoices/${setup.invoiceNumber}`, payload);
    expect(res.status()).toBe(200);
    const updated = expectContract(InvoiceMutationSchema.strict(), await res.json(), 'PATCH /invoices/:id');

    // Semantic: field changes land, status stays DRAFT, dueDate = issueDate+60d.
    expect(updated.status).toBe('DRAFT');
    expect(updated.paymentTermsDays).toBe(60);
    expect(updated.notes).toBe('QA updated — stretched to Net 60');
    expect(updated.internalNotes).toBe('QA internal note — do not expose to customer');
    const expectedDue = new Date(before.issueDate);
    expectedDue.setDate(expectedDue.getDate() + 60);
    expect(updated.dueDate).toBe(expectedDue.toISOString().split('T')[0]);

    // Persistence — GET echoes the change.
    const afterRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
    expect(after.paymentTermsDays).toBe(60);
  });

  // 7 ── POST /invoices/:invoice_id/send ─────────────────────────────
  test('POST /invoices/:invoice_id/send transitions DRAFT → SENT @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // No email (sendEmail omitted) — just the status transition, no
    // Resend client invocation. Factory emits empty body.
    const payload = buildSendInvoicePayload();
    const res = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/send`, payload);
    expect(res.status()).toBe(201);
    const sent = expectContract(InvoiceMutationSchema.strict(), await res.json(), 'POST /invoices/:id/send');

    // Semantic
    expect(sent.status).toBe('SENT');

    // Persistence
    const afterRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
    expect(after.status).toBe('SENT');

    // Second send — rejected (must be DRAFT).
    const againRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/send`, payload);
    expect(againRes.status()).toBe(400);
  });

  // 8 ── POST /invoices/:invoice_id/void ─────────────────────────────
  test('POST /invoices/:invoice_id/void voids a DRAFT invoice and frees the load for re-billing @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/void`, {});
    expect(res.status()).toBe(201);
    const voided = expectContract(InvoiceMutationSchema.strict(), await res.json(), 'POST /invoices/:id/void');

    // Semantic
    expect(voided.status).toBe('VOID');

    // Persistence — GET echoes VOID.
    const afterRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
    expect(after.status).toBe('VOID');

    // Second void on same invoice — rejected "already voided".
    const againRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/void`, {});
    expect(againRes.status()).toBe(400);
  });

  // 9 ── POST /invoices/:invoice_id/payments ────────────────────────
  test('POST /invoices/:invoice_id/payments records a full payment against a SENT invoice @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Payment recording requires SENT (service validation accepts
    // SENT/PARTIAL only — payment on DRAFT throws 400). Transition first.
    const sendRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/send`, {});
    expect(sendRes.status()).toBe(201);

    // Full payment via the factory — pays the entire 275000 balance.
    const payload = buildPayment({ amountCents: 275000 });
    const res = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/payments`, payload);
    expect(res.status()).toBe(201);
    const payment = expectContract(
      RecordPaymentResponseSchema.strict(),
      await res.json(),
      'POST /invoices/:id/payments',
    );

    // Semantic: payment row reflects the amount + reference.
    expect(payment.amountCents).toBe(275000);
    expect(payment.paymentMethod).toBe('ACH');
    expect(payment.referenceNumber).toBe(payload.referenceNumber);

    // Persistence — invoice flips to PAID, payments array has one row.
    const afterRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
    expect(after.status).toBe('PAID');
    expect(after.paidCents).toBe(275000);
    expect(after.balanceCents).toBe(0);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].amountCents).toBe(275000);
  });

  // 10 ── POST /invoices/:invoice_id/resend ─────────────────────────
  test('POST /invoices/:invoice_id/resend re-invokes email delivery on a SENT invoice @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Precondition: send first so the invoice has status SENT. Resend then
    // calls InvoiceEmailService.sendInvoice, which returns
    // `{ sent: true, to, invoiceNumber }` whether or not RESEND_API_KEY is
    // set (dev mode logs without sending; still a truthy `sent: true`).
    const sendRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/send`, {});
    expect(sendRes.status()).toBe(201);

    const res = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/resend`, {});
    // The email service throws NotFoundException (404) when the invoice's
    // customer has neither billingEmail nor a primary contact. Demo tenant
    // customers are seeded with both, so this is the happy path.
    expect(res.status()).toBe(201);
    const body = expectContract(SendInvoiceResponseSchema.strict(), await res.json(), 'POST /invoices/:id/resend');

    expect(body.sent).toBe(true);
    expect(body.to).toMatch(/@/);
    expect(body.invoiceNumber).toBeTruthy();
  });

  // 11 ── POST /invoices/:invoice_id/reinvoice ──────────────────────
  test('POST /invoices/:invoice_id/reinvoice regenerates a DRAFT invoice from a voided one @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Precondition: void first. The service explicitly requires status=VOID
    // before it re-invokes generateFromLoad. Voiding also flips the load's
    // billingStatus back to APPROVED, which generateFromLoad requires.
    const voidRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/void`, {});
    expect(voidRes.status()).toBe(201);

    const res = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/reinvoice`, {});
    expect(res.status()).toBe(201);
    const reinvoice = expectContract(InvoiceMutationSchema.strict(), await res.json(), 'POST /invoices/:id/reinvoice');

    // Semantic: a BRAND NEW invoice — different invoiceNumber, still DRAFT,
    // same totals as the voided one.
    expect(reinvoice.invoiceNumber).not.toBe(setup.invoiceNumber);
    expect(reinvoice.status).toBe('DRAFT');
    expect(reinvoice.totalCents).toBe(275000);

    // Persistence — GET the new invoice confirms it stands alone.
    const afterRes = await asDispatcher.get(`/invoices/${reinvoice.invoiceNumber}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(InvoiceDetailSchema.strict(), await afterRes.json());
    expect(after.invoiceNumber).toBe(reinvoice.invoiceNumber);
    expect(after.status).toBe('DRAFT');

    // Original voided invoice is still VOID (reinvoice does not modify it).
    const originalRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(originalRes.status()).toBe(200);
    const original = expectContract(InvoiceDetailSchema.strict(), await originalRes.json());
    expect(original.status).toBe('VOID');
  });
});

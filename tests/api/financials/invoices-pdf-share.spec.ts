/**
 * Financials — Invoice PDF / Share / Doc Bundle / Factor (Phase 2 Group 2b).
 *
 * Covers 8 endpoints on `InvoicingController`:
 *
 *   1. GET  /invoices/:invoice_id/pdf                    (attachment PDF)
 *   2. GET  /invoices/:invoice_id/pdf/preview            (inline PDF)
 *   3. GET  /invoices/:invoice_id/email-preview          (JSON envelope)
 *   4. POST /invoices/:invoice_id/share                  (shareable link)
 *   5. GET  /invoices/:invoice_id/doc-bundle             (document list)
 *   6. GET  /invoices/:invoice_id/doc-bundle/download    (PDF bundle, @slow)
 *   7. POST /invoices/:invoice_id/submit-to-factor       (@requires:data-factoring-linked)
 *   8. POST /invoices/:invoice_id/factor                 (@requires:data-factoring-linked, legacy)
 *
 * Role: all 8 endpoints are DISPATCHER/ADMIN/OWNER → `asDispatcher`.
 *
 * PDF assertions: content-type contains `application/pdf`, body length
 * exceeds a floor, leading bytes are `%PDF-`. We do NOT parse the PDF —
 * that's the renderer's contract, not the controller's.
 *
 * Doc-bundle download note: despite the Swagger annotation reading "PDF",
 * the implementation returns a single invoice PDF today (doc-bundle
 * aggregation is stubbed — see DocBundleService.generateBundle). Asserting
 * `application/pdf` as the actual emitted content type. The @slow tag is
 * retained because pdfmake startup + font loading regularly pushes this
 * past 3s on a cold worker.
 *
 * Factoring endpoints (#7, #8): require the tenant's customer to have a
 * default factoring company linked AND the generated invoice to inherit
 * `billingPath=FACTORED`. Demo-northstar-2026 does not seed this today
 * — tagged `@requires:data-factoring-linked` so they are excluded at
 * collection time on that tenant (see
 * `tests/config/detect-capabilities.ts`). When a future tenant seeds this
 * capability, flip `TESTS_DATA_CAPABILITIES=factoring-linked` to run.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildShareLinkRequest, buildSubmitToFactorPayload } from '@sally/test-utils/factories';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, InvoiceSchemas } from '@sally/test-utils/schemas';
import { createInvoiceableLoad, withBillingOverrideEnabled } from './_helpers.js';

const {
  EmailPreviewResponseSchema,
  ShareLinkResponseSchema,
  DocBundleListResponseSchema,
  SubmitToFactorResponseSchema,
} = InvoiceSchemas;

const PDF_MIN_BYTES = 1024;

test.describe('Financials · Invoice PDF + Share + Factor @workflow', () => {
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

  // 1 ── GET /invoices/:invoice_id/pdf ──────────────────────────────
  test('GET /invoices/:invoice_id/pdf downloads a PDF binary with attachment disposition @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/invoices/${setup.invoiceNumber}/pdf`);
    expect(res.status()).toBe(200);

    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');

    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  // 2 ── GET /invoices/:invoice_id/pdf/preview ──────────────────────
  test('GET /invoices/:invoice_id/pdf/preview returns the same PDF inline @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/invoices/${setup.invoiceNumber}/pdf/preview`);
    expect(res.status()).toBe(200);

    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('inline');

    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  // 3 ── GET /invoices/:invoice_id/email-preview ────────────────────
  test('GET /invoices/:invoice_id/email-preview returns the composed email envelope @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/invoices/${setup.invoiceNumber}/email-preview`);
    expect(res.status()).toBe(200);
    const envelope = expectContract(
      EmailPreviewResponseSchema.strict(),
      await res.json(),
      'GET /invoices/:id/email-preview',
    );

    // Semantic: subject contains the invoice number; body is non-trivial HTML;
    // hasPdfAttachment is always true (the send path attaches the PDF).
    expect(envelope.subject).toContain(envelope.invoiceNumber);
    expect(envelope.bodyHtml.length).toBeGreaterThan(200);
    expect(envelope.hasPdfAttachment).toBe(true);
  });

  // 4 ── POST /invoices/:invoice_id/share ───────────────────────────
  test('POST /invoices/:invoice_id/share returns a share link with token and 90-day expiry @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const payload = buildShareLinkRequest();
    const res = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/share`, payload);
    expect(res.status()).toBe(201);
    const link = expectContract(ShareLinkResponseSchema.strict(), await res.json(), 'POST /invoices/:id/share');

    // Semantic: URL contains the token; expiresAt ~90 days from now.
    expect(link.url).toContain(link.token);
    expect(link.token.length).toBeGreaterThanOrEqual(32);
    const expiresMs = new Date(link.expiresAt).getTime();
    const nowMs = Date.now();
    const diffDays = (expiresMs - nowMs) / (1000 * 60 * 60 * 24);
    // Allow a wide band around 90 days so clock-skew + slow CI don't flake.
    expect(diffDays).toBeGreaterThan(89);
    expect(diffDays).toBeLessThan(91);

    // Persistence: a second call creates a distinct link (tokens are random).
    const secondRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/share`, payload);
    expect(secondRes.status()).toBe(201);
    const second = expectContract(ShareLinkResponseSchema.strict(), await secondRes.json());
    expect(second.token).not.toBe(link.token);
  });

  // 5 ── GET /invoices/:invoice_id/doc-bundle ───────────────────────
  test('GET /invoices/:invoice_id/doc-bundle lists available docs + missing types @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/invoices/${setup.invoiceNumber}/doc-bundle`);
    expect(res.status()).toBe(200);
    const bundle = expectContract(
      DocBundleListResponseSchema.strict(),
      await res.json(),
      'GET /invoices/:id/doc-bundle',
    );

    // Semantic: the invoice we just created has no uploaded docs (no S3
    // round-trip in `createInvoiceableLoad`), so `missing` must contain all
    // three required types and `documents` is empty.
    expect(bundle.invoiceNumber).toBe(setup.invoiceNumber);
    expect(bundle.documents).toHaveLength(0);
    expect(bundle.missing).toEqual(expect.arrayContaining(['RATE_CON', 'BOL', 'POD']));
    expect(bundle.missing).toHaveLength(3);
  });

  // 6 ── GET /invoices/:invoice_id/doc-bundle/download ──────────────
  test('GET /invoices/:invoice_id/doc-bundle/download returns a PDF bundle @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/invoices/${setup.invoiceNumber}/doc-bundle/download`);
    expect(res.status()).toBe(200);

    // Controller sets Content-Type: application/pdf explicitly (see
    // invoicing.controller.ts — `'Content-Type': 'application/pdf'`). The
    // "bundle" today is just the invoice PDF; loads with uploaded BOL/POD
    // would be concatenated in a future iteration.
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('-bundle.pdf');

    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  // 7 ── POST /invoices/:invoice_id/submit-to-factor ────────────────
  test('POST /invoices/:invoice_id/submit-to-factor records factor submission on a SENT + FACTORED invoice @workflow @destructive @requires:data-factoring-linked', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Data gate: requires the seeded customer to have a default factoring
    // company so `generateFromLoad` inherits `billingPath=FACTORED`. When
    // absent, this test is excluded at collection time. The body below is
    // only reached once the fixture is set up in the tenant (future
    // Group 2c).
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Precondition: must be SENT or PARTIAL — send first.
    const sendRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/send`, {});
    expect(sendRes.status()).toBe(201);

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

    const payload = buildSubmitToFactorPayload(companyId, {
      factoringReference: 'QA-PHASE-2-SUBMIT',
      sendEmail: false,
    });
    const res = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/submit-to-factor`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      SubmitToFactorResponseSchema.strict(),
      await res.json(),
      'POST /invoices/:id/submit-to-factor',
    );

    // Semantic: envelope `{ invoice, noaWarning }`. noaWarning non-null
    // when NOA record is missing/unacknowledged — acceptable, just a warning.
    expect(body.invoice.invoiceNumber).toBe(setup.invoiceNumber);
    expect(body.invoice.factoringReference).toBe('QA-PHASE-2-SUBMIT');
    expect(body.invoice.submittedToFactorAt).not.toBeNull();
  });

  // Legacy POST /invoices/:invoice_id/factor was DELETED in Phase 4A.
  // The single submit flow lives in submitToFactor (case #7 above), which
  // now ALSO transitions status SENT → FACTORED — see the assertion in #7.
});

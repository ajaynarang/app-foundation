/**
 * Financials — Public Invoice View + PDF (Phase 2 Group 2d).
 *
 * Covers two endpoints on `InvoicePublicController` (all `@Public()` — no
 * bearer required):
 *
 *   1. GET /invoices/public/:token         → JSON envelope
 *   2. GET /invoices/public/:token/pdf     → PDF binary
 *
 * Fixture shape — mirrors `tests/api/fleet/tracking.spec.ts`:
 *
 *   DISPATCHER creates + delivers a load, ADMIN is used only for the
 *   billing-override setting and the driver provisioning path. Close-out
 *   approve + `/invoices/generate/:load_id` produce a DRAFT invoice. The
 *   dispatcher then calls `POST /invoices/:id/share` to mint a shareable
 *   token. Everything public is hit by `asAnonymous` — no header of any
 *   kind. Cleanup: void the invoice then delete the load.
 *
 * The PDF body is verified via `%PDF-` magic bytes + a size floor, not
 * parsed — the renderer's fidelity is out of scope for the public
 * controller contract. The JSON envelope is validated via a strict-mode
 * Zod schema so any future backend field addition to the public contract
 * surfaces as a visible drift.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildShareLinkRequest } from '@sally/test-utils/factories';
import { cleanupInvoice, cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, InvoiceSchemas } from '@sally/test-utils/schemas';
import { createInvoiceableLoad, withBillingOverrideEnabled } from './_helpers.js';

const { ShareLinkResponseSchema, PublicInvoiceSchema } = InvoiceSchemas;

const PDF_MIN_BYTES = 1024;

test.describe('Financials · Invoice Public @workflow', () => {
  const createdInvoiceIds: string[] = [];
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    // Invoices first — voiding them is cheap and avoids FK trouble when the
    // load is deleted next. `cleanupInvoice` swallows 404 internally; wrap
    // in `.catch` so a 400 on already-VOID never masks the real test
    // failure.
    for (const invoiceId of createdInvoiceIds.splice(0)) {
      await cleanupInvoice(asDispatcher, invoiceId).catch(() => undefined);
    }
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  // 1 ── GET /invoices/public/:token ───────────────────────────────────
  test('GET /invoices/public/:token returns the public invoice envelope (no auth) @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asAnonymous,
  }) => {
    // Arrange — mint a DRAFT invoice and a fresh share token.
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);
    createdInvoiceIds.push(setup.invoiceNumber);

    const shareRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/share`, buildShareLinkRequest());
    expect(shareRes.status()).toBe(201);
    const link = expectContract(ShareLinkResponseSchema.strict(), await shareRes.json(), 'POST /invoices/:id/share');

    // Act — anonymous fetch of the public view.
    const res = await asAnonymous.get(`/invoices/public/${encodeURIComponent(link.token)}`);
    expect(res.status()).toBe(200);
    const pub = expectContract(PublicInvoiceSchema.strict(), await res.json(), 'GET /invoices/public/:token');

    // Semantic — envelope reflects the invoice we just minted. Fresh invoice
    // is DRAFT, fully unpaid, so paid/balance ratios are deterministic.
    expect(pub.status).toBe('DRAFT');
    expect(pub.paidCents).toBe(0);
    expect(pub.balanceCents).toBe(pub.totalCents);
    // Default tenant payment terms from demo seed (non-negative sanity).
    expect(pub.paymentTermsDays).toBeGreaterThanOrEqual(0);
    // Same invoice number as the authenticated detail view — the public
    // contract never masks or rewrites `invoiceNumber`.
    const detailRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(detailRes.status()).toBe(200);
    const detail = (await detailRes.json()) as { invoiceNumber: string };
    expect(pub.invoiceNumber).toBe(detail.invoiceNumber);

    // Persistence — a second anonymous fetch returns the same envelope
    // (idempotent read path, token is not single-use).
    const secondRes = await asAnonymous.get(`/invoices/public/${encodeURIComponent(link.token)}`);
    expect(secondRes.status()).toBe(200);
    const second = expectContract(PublicInvoiceSchema.strict(), await secondRes.json());
    expect(second.invoiceNumber).toBe(pub.invoiceNumber);
    expect(second.totalCents).toBe(pub.totalCents);
  });

  // 2 ── GET /invoices/public/:token/pdf ───────────────────────────────
  test('GET /invoices/public/:token/pdf downloads the invoice PDF (no auth) @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
    asAnonymous,
  }) => {
    // Arrange — same bootstrap as test 1.
    await withBillingOverrideEnabled(asAdmin);
    const setup = await createInvoiceableLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);
    createdInvoiceIds.push(setup.invoiceNumber);

    const shareRes = await asDispatcher.post(`/invoices/${setup.invoiceNumber}/share`, buildShareLinkRequest());
    expect(shareRes.status()).toBe(201);
    const link = expectContract(ShareLinkResponseSchema.strict(), await shareRes.json());

    // Act — anonymous PDF fetch.
    const res = await asAnonymous.get(`/invoices/public/${encodeURIComponent(link.token)}/pdf`);
    expect(res.status()).toBe(200);

    // Assert headers — controller sets application/pdf + attachment with
    // `<invoiceNumber>.pdf` filename.
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');

    // Assert body — non-empty, starts with the PDF magic bytes.
    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');

    // Persistence — the authenticated detail endpoint still returns 200
    // after the public read (public path is strictly read-only).
    const detailRes = await asDispatcher.get(`/invoices/${setup.invoiceNumber}`);
    expect(detailRes.status()).toBe(200);
  });
});

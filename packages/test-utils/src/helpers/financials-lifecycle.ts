/**
 * financials-lifecycle.ts — State-machine helpers for the Financials domain.
 *
 * Backend controllers:
 *   apps/backend/src/domains/financials/invoicing/controllers/invoicing.controller.ts
 *   — base path: /invoices
 *   — POST generate/:load_id  (line 77)  — generate invoice from delivered load
 *   — POST :invoice_id/payments (line 508) — record payment against invoice
 *   — POST :invoice_id/void    (line 497) — void an invoice (cleanup alternative)
 *
 * No payments-specific controller was found — payments live under invoice sub-routes.
 *
 * Errors include full context (method + URL + status + body snippet).
 */

import type { RoleApiClient } from '../playwright/api-client.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const INVOICE_ENDPOINT = '/invoices';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneratedInvoice {
  id: number;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  [key: string]: unknown;
}

export interface RecordedPayment {
  id: number;
  amountCents: number;
  paymentMethod: string | null;
  referenceNumber: string | null;
  paidAt: string;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function errorContext(method: string, url: string, status: number, body: string): string {
  const snippet = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  return `${method} ${url} → HTTP ${status}${snippet ? `: ${snippet}` : ''}`;
}

// ── Invoice generation ────────────────────────────────────────────────────────

/**
 * POST /invoices/generate/:loadId — Auto-generate an invoice from a delivered load.
 *
 * The load must be in DELIVERED status for this to succeed. The backend derives
 * line items, rate, and customer linkage from the load record.
 *
 * Backend: POST 'generate/:load_id' (line 77 in invoicing.controller.ts).
 */
export async function generateInvoiceForLoad(api: RoleApiClient, loadId: string | number): Promise<GeneratedInvoice> {
  const url = `${INVOICE_ENDPOINT}/generate/${loadId}`;
  const res = await api.post(url, {});
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`generateInvoiceForLoad failed: ${errorContext('POST', url, res.status(), body)}`);
  }
  return (await res.json()) as GeneratedInvoice;
}

// ── Payment recording ─────────────────────────────────────────────────────────

/**
 * POST /invoices/:invoiceId/payments — Record a payment against an invoice.
 *
 * Backend: POST ':invoice_id/payments' (line 508 in invoicing.controller.ts).
 * Payload shape: { amountCents, paymentMethod?, referenceNumber?, paidAt? }
 */
export async function recordPayment(
  api: RoleApiClient,
  invoiceId: string | number,
  amountCents: number,
  options: {
    paymentMethod?: string;
    referenceNumber?: string;
    paidAt?: string;
  } = {},
): Promise<RecordedPayment> {
  const url = `${INVOICE_ENDPOINT}/${invoiceId}/payments`;
  const payload = {
    amountCents,
    paymentMethod: options.paymentMethod ?? 'CHECK',
    ...(options.referenceNumber !== undefined ? { referenceNumber: options.referenceNumber } : {}),
    ...(options.paidAt !== undefined ? { paidAt: options.paidAt } : {}),
  };

  const res = await api.post(url, payload);
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`recordPayment failed: ${errorContext('POST', url, res.status(), body)}`);
  }
  return (await res.json()) as RecordedPayment;
}

// ── Invoice cleanup ───────────────────────────────────────────────────────────

/**
 * POST /invoices/:invoiceId/void — Void an invoice after a test.
 * Preferred over hard-delete because the backend may not expose DELETE.
 *
 * Backend: POST ':invoice_id/void' (line 497 in invoicing.controller.ts).
 * 404 is acceptable — invoice already voided or removed.
 */
export async function cleanupInvoice(api: RoleApiClient, invoiceId: string | number): Promise<void> {
  const url = `${INVOICE_ENDPOINT}/${invoiceId}/void`;
  const res = await api.post(url, {});
  if (!res.ok() && res.status() !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`cleanupInvoice failed: ${errorContext('POST', url, res.status(), body)}`);
  }
}

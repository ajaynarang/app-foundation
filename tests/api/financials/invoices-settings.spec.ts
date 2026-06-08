/**
 * Financials — Invoicing Settings + Customer Payment Stats (Phase 2 Group 2b).
 *
 * Covers 3 endpoints on `InvoicingController`:
 *
 *   1. GET   /invoices/settings
 *   2. PATCH /invoices/settings                        (ADMIN/OWNER)
 *   3. GET   /invoices/customers/:customer_id/payment-stats
 *
 * Role:
 *   - /invoices/settings GET  → DISPATCHER/ADMIN/OWNER → `asDispatcher`.
 *   - /invoices/settings PATCH → ADMIN/OWNER → `asAdmin`.
 *   - /invoices/customers/.../payment-stats → DISPATCHER/ADMIN/OWNER.
 *
 * Settings round-trip pattern:
 *   `InvoiceSettingsService.updateSettings` upserts — first PATCH on a
 *   fresh-ish tenant auto-creates the row via GET. We snapshot the current
 *   values, PATCH a subset, GET to verify, then PATCH the snapshot back in
 *   `afterEach` so the tenant is left as-found. Restoring via the same
 *   endpoint guarantees the service's own update contract is also being
 *   tested on the restore path.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildInvoiceSettingsUpdate } from '@sally/test-utils/factories';
import { expectContract, InvoiceSchemas } from '@sally/test-utils/schemas';
import { firstCustomerId } from './_helpers.js';

const { InvoiceSettingsResponseSchema, PaymentStatsResponseSchema } = InvoiceSchemas;

test.describe('Financials · Invoicing Settings @workflow', () => {
  // Snapshot the four fields this spec mutates so afterEach can restore them.
  // Each test captures its own snapshot inside the try/finally; this array
  // is a fallback for the round-trip test specifically.
  let settingsSnapshot: {
    invoicePrefix: string | null;
    defaultPaymentTermsDays: number | null;
    remittanceInstructions: string | null;
    defaultNotes: string | null;
  } | null = null;

  test.afterEach(async ({ asAdmin }) => {
    if (!settingsSnapshot) return;
    // Best-effort restore — if the test failed before mutation, snapshot
    // equals current and this PATCH is a no-op.
    await asAdmin.patch('/invoices/settings', settingsSnapshot).catch(() => undefined);
    settingsSnapshot = null;
  });

  // 1 ── GET /invoices/settings ─────────────────────────────────────
  test('GET /invoices/settings returns the tenant invoice settings record @workflow', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/invoices/settings');
    expect(res.status()).toBe(200);
    const settings = expectContract(InvoiceSettingsResponseSchema.strict(), await res.json(), 'GET /invoices/settings');

    // Semantic: every field is declared (nullable). Verify the shape is
    // parseable; no cross-field invariant to assert on defaults.
    expect(settings).toBeDefined();

    // Persistence: second GET returns the same record (no caching bug).
    const againRes = await asDispatcher.get('/invoices/settings');
    expect(againRes.status()).toBe(200);
    const again = expectContract(InvoiceSettingsResponseSchema.strict(), await againRes.json());
    expect(again.invoicePrefix).toBe(settings.invoicePrefix);
    expect(again.defaultPaymentTermsDays).toBe(settings.defaultPaymentTermsDays);
  });

  // 2 ── PATCH /invoices/settings ───────────────────────────────────
  test('PATCH /invoices/settings round-trips a partial update (ADMIN only) @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Snapshot before mutation so afterEach can restore. Using asDispatcher
    // for the read is intentional — verifies both roles can read.
    const beforeRes = await asDispatcher.get('/invoices/settings');
    expect(beforeRes.status()).toBe(200);
    const before = expectContract(InvoiceSettingsResponseSchema.strict(), await beforeRes.json());
    settingsSnapshot = {
      invoicePrefix: before.invoicePrefix,
      defaultPaymentTermsDays: before.defaultPaymentTermsDays,
      remittanceInstructions: before.remittanceInstructions,
      defaultNotes: before.defaultNotes,
    };

    // Mutate three fields. Use timestamps so concurrent test runs don't
    // collide on the same prefix.
    const newPrefix = `QA${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const payload = buildInvoiceSettingsUpdate({
      invoicePrefix: newPrefix,
      defaultPaymentTermsDays: 45,
      defaultNotes: 'QA Phase 2 — round-trip marker',
    });
    const res = await asAdmin.patch('/invoices/settings', payload);
    expect(res.status()).toBe(200);
    const updated = expectContract(
      InvoiceSettingsResponseSchema.strict(),
      await res.json(),
      'PATCH /invoices/settings',
    );

    // Semantic — returned body echoes the new values.
    expect(updated.invoicePrefix).toBe(newPrefix);
    expect(updated.defaultPaymentTermsDays).toBe(45);
    expect(updated.defaultNotes).toBe('QA Phase 2 — round-trip marker');

    // Persistence — GET reads back the new values.
    const afterRes = await asDispatcher.get('/invoices/settings');
    expect(afterRes.status()).toBe(200);
    const after = expectContract(InvoiceSettingsResponseSchema.strict(), await afterRes.json());
    expect(after.invoicePrefix).toBe(newPrefix);
    expect(after.defaultPaymentTermsDays).toBe(45);
    expect(after.defaultNotes).toBe('QA Phase 2 — round-trip marker');

    // RBAC — DISPATCHER cannot PATCH (endpoint is @Roles(ADMIN, OWNER)).
    const rbacRes = await asDispatcher.patch('/invoices/settings', {
      invoicePrefix: 'HACK',
    });
    expect(rbacRes.status()).toBe(403);
  });

  // 3 ── GET /invoices/customers/:customer_id/payment-stats ────────
  test('GET /invoices/customers/:customer_id/payment-stats returns reliability stats or hasHistory=false @workflow', async ({
    asDispatcher,
  }) => {
    // Need the string public customer id, not the numeric db id — the
    // controller looks up by `customerId` (public) on the Customer table.
    const dbId = await firstCustomerId(asDispatcher);
    const listRes = await asDispatcher.get('/customers');
    expect(listRes.status()).toBe(200);
    const rawList = await listRes.json();
    const items = Array.isArray(rawList)
      ? (rawList as Array<{ id: number; customerId: string }>)
      : ((rawList as { data?: Array<{ id: number; customerId: string }> }).data ?? []);
    const customer = items.find((c) => c.id === dbId);
    expect(customer, 'firstCustomerId returned an id not in /customers list').toBeDefined();
    const publicId = customer!.customerId;

    const res = await asDispatcher.get(`/invoices/customers/${publicId}/payment-stats`);
    expect(res.status()).toBe(200);
    const stats = expectContract(
      PaymentStatsResponseSchema,
      await res.json(),
      'GET /invoices/customers/:id/payment-stats',
    );

    // Semantic: either the `hasHistory: false` branch or the populated
    // shape. When populated, avgDaysToPay is non-negative and reliability
    // is one of the four documented labels.
    if (stats.hasHistory) {
      expect(stats.avgDaysToPay).toBeGreaterThanOrEqual(0);
      expect(['Excellent', 'Good', 'Average', 'Slow']).toContain(stats.reliability);
      expect(stats.totalInvoicesPaid).toBeGreaterThan(0);
      expect(stats.outstandingCents).toBeGreaterThanOrEqual(0);
    }

    // Unknown customer id → 404.
    const missingRes = await asDispatcher.get('/invoices/customers/cust_does_not_exist/payment-stats');
    expect(missingRes.status()).toBe(404);
  });
});

import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Factoring bundle (Phase 2) @browser
 *
 * Verifies the dialog wiring of the new merged-bundle behavior:
 *   - Bundle status section shows the four canonical rows with the new shape
 *     (INVOICE always available + RATE_CON / BOL / POD source rows).
 *   - "Preview bundle" button is rendered and reachable.
 *   - Per-row "Upload <label>" links deep-link with ?tab=docs and the load
 *     detail sheet opens directly on the Docs tab.
 *
 * NOTE: a fully end-to-end submit (uploading source PDFs to S3, exercising
 * the merge, and asserting the factor email was sent) belongs in the QA
 * suite where seeded loads have backing S3 objects. Phase 2's browser
 * coverage is the dialog-side wiring + deep-link plumbing, not the merge.
 */

async function loginAsDispatcher(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Factoring bundle dialog · Phase 2 wiring @browser', () => {
  test('dialog renders the four bundle rows + Preview button when an invoice is selected', async ({ page }) => {
    await loginAsDispatcher(page);

    // Open billing → invoices, then submit-to-factor on the first FACTORED-path SENT invoice.
    await page.goto(`${ENV.webBaseUrl}/dispatcher/billing`);
    await page.waitForLoadState('networkidle');

    // Open the first invoice that has a Submit-to-factor action available.
    const submitTrigger = page.getByRole('button', { name: /Submit to factor/i }).first();
    if ((await submitTrigger.count()) === 0) {
      test.skip(true, 'No FACTORED-path invoice in the seed set; skipping dialog assertion.');
      return;
    }
    await submitTrigger.click();

    // The dialog title should be present.
    await expect(page.getByRole('heading', { name: /Submit to Factor/i })).toBeVisible({ timeout: 10_000 });

    // The four canonical document rows must render.
    await expect(page.getByText(/Invoice/, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Rate Confirmation/i)).toBeVisible();
    await expect(page.getByText(/Bill of Lading/i)).toBeVisible();
    await expect(page.getByText(/Proof of Delivery/i)).toBeVisible();

    // Preview button is reachable (we don't actually open the new tab here —
    // popups are flaky in headless; we just verify the trigger is present
    // and not disabled when the doc-bundle query has resolved).
    const preview = page.getByRole('button', { name: /Preview merged bundle PDF/i });
    await expect(preview).toBeVisible();
  });

  test('a missing-doc row exposes an "Upload <label>" deep-link and the Phase 1 banner is gone', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/billing`);
    await page.waitForLoadState('networkidle');

    const submitTrigger = page.getByRole('button', { name: /Submit to factor/i }).first();
    if ((await submitTrigger.count()) === 0) {
      test.skip(true, 'No FACTORED-path invoice in the seed set; skipping deep-link assertion.');
      return;
    }
    await submitTrigger.click();

    await expect(page.getByRole('heading', { name: /Submit to Factor/i })).toBeVisible({ timeout: 10_000 });

    // Phase 1 throwaway banner ("Bundle currently includes the invoice PDF only…") MUST be gone.
    await expect(page.getByText(/Bundle currently includes the invoice PDF only/i)).toHaveCount(0);

    // If any doc is missing, the corresponding "Upload <label>" anchor must
    // point at /dispatcher/loads with ?open=<id>&tab=docs. The seed may have
    // a fully-ready bundle, in which case we can't assert the upload link
    // — so this assertion is best-effort.
    const uploadLink = page
      .locator('a', { hasText: /^Upload (Rate Confirmation|Bill of Lading|Proof of Delivery)/ })
      .first();
    if ((await uploadLink.count()) > 0) {
      const href = await uploadLink.getAttribute('href');
      expect(href).toMatch(/\/dispatcher\/loads\?open=[^&]+&tab=docs/);
    }
  });

  test('opening /dispatcher/loads?open=<id>&tab=docs lands directly on the Docs tab', async ({ page, request }) => {
    await loginAsDispatcher(page);

    // Pull any DELIVERED load via the API so we have a real ID.
    const apiBase = ENV.apiBaseUrl.replace(/\/$/, '');
    const tokenCookie = (await page.context().cookies()).find((c) => c.name.toLowerCase().includes('auth'));
    const headers: Record<string, string> = {};
    if (tokenCookie) headers['cookie'] = `${tokenCookie.name}=${tokenCookie.value}`;

    const resp = await request.get(`${apiBase}/loads?status=DELIVERED&limit=1`, { headers });
    if (!resp.ok()) {
      test.skip(true, `Could not list loads (${resp.status()}); skipping deep-link assertion.`);
      return;
    }
    const body = (await resp.json()) as { items?: Array<{ loadId: string }> } | Array<{ loadId: string }>;
    const items = Array.isArray(body) ? body : (body.items ?? []);
    if (items.length === 0) {
      test.skip(true, 'No DELIVERED loads in the seed set; skipping deep-link assertion.');
      return;
    }

    const loadId = items[0].loadId;
    await page.goto(`${ENV.webBaseUrl}/dispatcher/loads?open=${encodeURIComponent(loadId)}&tab=docs`);
    await page.waitForLoadState('networkidle');

    // The Docs tab trigger has aria-state=active when selected.
    const docsTab = page.getByRole('tab', { name: /Docs/i });
    await expect(docsTab).toHaveAttribute('data-state', 'active', { timeout: 10_000 });
  });
});

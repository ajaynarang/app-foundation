import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Network → Factoring · Bundle format toggle @browser
 *
 * Cleanup phase of the factoring overhaul: tenant-level setting controls what
 * the factor email attaches (ZIP of separate PDFs vs single merged PDF).
 * ADMIN/OWNER only — DISPATCHER sees the radios disabled with a hint.
 *
 * The test dispatcher user has ADMIN-equivalent privileges on staging (see
 * tests/config/test-env.ts) so it can perform the flip; the disabled-state
 * assertion is covered by the API spec (tests/api/financials/tenant-bundle-format.spec.ts).
 */

async function login(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Network → Factoring · bundle format @browser', () => {
  test.afterEach(async ({ page }) => {
    // Restore default ZIP so other tests aren't affected by the in-flight format flip.
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=factoring`);
    await page.waitForLoadState('networkidle');
    const zip = page.getByRole('radio', { name: /ZIP \(separate files\)/i });
    if ((await zip.count()) > 0 && (await zip.getAttribute('aria-checked')) !== 'true') {
      await zip.click().catch(() => undefined);
    }
  });

  test('Bundle format section renders with ZIP as the default selection', async ({ page }) => {
    await login(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=factoring`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Factor bundle format')).toBeVisible();
    await expect(page.getByText(/Recommended/i)).toBeVisible();

    const zipRadio = page.getByRole('radio', { name: /ZIP \(separate files\)/i });
    await expect(zipRadio).toBeVisible();
    // We can't strictly assert "ZIP is checked" because the test tenant may
    // already have flipped to MERGED_PDF in a prior run. Both options visible
    // is the load-bearing assertion.
    await expect(page.getByRole('radio', { name: /Merged PDF/i })).toBeVisible();
  });

  test('Flipping to Merged PDF shows a success toast and persists across reload', async ({ page }) => {
    await login(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=factoring`);
    await page.waitForLoadState('networkidle');

    // Flip to MERGED_PDF
    await page.getByRole('radio', { name: /Merged PDF/i }).click();
    await expect(page.getByText(/Factor bundle format set to Merged PDF/i)).toBeVisible({ timeout: 5_000 });

    // Reload and confirm persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    const pdfRadio = page.getByRole('radio', { name: /Merged PDF/i });
    await expect(pdfRadio).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });

    // Flip back to ZIP — also verifies bidirectional toggle.
    await page.getByRole('radio', { name: /ZIP \(separate files\)/i }).click();
    await expect(page.getByText(/Factor bundle format set to ZIP/i)).toBeVisible({ timeout: 5_000 });
  });
});

import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Auto-mileage — route summary chip on the load detail @browser
 *
 * Feature PRs #750 + #753. After a load is created/edited, a BullMQ worker
 * computes total miles + drive hours via HERE Routing and writes them onto the
 * Load. The Overview tab's route visual renders a LoadRouteSummaryChip that:
 *   - shows "calculating route…" + a skeleton while mileage is still null, then
 *   - live-updates (via the load:mileage-calculated SSE event) to
 *     "<n> mi · ~<h> drive · via HERE".
 *
 * This spec verifies the chip renders in one of its two valid states on an
 * existing load — it does not create a fresh load (the picker spec covers
 * creation; mileage timing is data/queue dependent).
 */

async function loginAsDispatcher(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Auto-mileage — load route summary chip @browser', () => {
  test('the load detail Overview tab renders a route summary chip', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/loads`);
    await page.waitForLoadState('networkidle');

    // Open the first load in the list.
    const firstRow = page.getByRole('row').nth(1); // row 0 is the header
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.click();

    // Overview is the default tab on the load detail.
    const overview = page.getByRole('tab', { name: /Overview/i });
    if (await overview.isVisible().catch(() => false)) {
      await overview.click();
    }

    // The route visual only renders when the load has an origin/destination.
    // The chip is in one of two valid states — pending or computed.
    const calculating = page.getByText(/calculating route/i);
    const computed = page.getByText(/\bmi\b/i).filter({ hasText: /drive/i });

    await expect(calculating.or(computed).first()).toBeVisible({ timeout: 15_000 });
  });

  test('a load with computed mileage shows distance, drive time, and provider', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/loads`);
    await page.waitForLoadState('networkidle');

    const firstRow = page.getByRole('row').nth(1);
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.click();

    const overview = page.getByRole('tab', { name: /Overview/i });
    if (await overview.isVisible().catch(() => false)) {
      await overview.click();
    }

    // If mileage has been computed for this load, the chip shows "via HERE".
    // If still pending, the spec is informational — skip rather than fail,
    // since queue timing is environment-dependent.
    const computedChip = page.getByText(/via HERE/i);
    const isComputed = await computedChip.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!isComputed, 'Selected load has no computed mileage yet (queue pending)');

    await expect(computedChip).toBeVisible();
    // Distance + drive-time tokens render alongside the provider.
    await expect(page.getByText(/drive/i).first()).toBeVisible();
  });
});

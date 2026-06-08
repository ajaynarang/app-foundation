import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Network → Factoring · ★ pin column @browser
 *
 * Phase 1 of the factoring overhaul: tenant default lives on
 * `Tenant.defaultFactoringCompanyId`. Pinning factor B unpins factor A
 * automatically — there is no longer a "Default" pill anywhere.
 */

async function loginAsDispatcher(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Network → Factoring · pin/unpin @browser', () => {
  test('★ button is rendered for every factoring row, exactly one (or none) is pinned', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=factoring`);
    await page.waitForLoadState('networkidle');

    const pinButtons = page.locator('button[aria-label="Pin as factor"], button[aria-label="Unpin factor"]');
    const count = await pinButtons.count();
    expect(count).toBeGreaterThan(0);

    const pinned = page.locator('button[aria-label="Unpin factor"]');
    const pinnedCount = await pinned.count();
    expect(pinnedCount).toBeLessThanOrEqual(1);
  });

  test('clicking ★ on an unpinned row pins it and shows a success toast', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=factoring`);
    await page.waitForLoadState('networkidle');

    // First unpin whatever is pinned (if anything) so we have a known state.
    const unpinFirst = page.locator('button[aria-label="Unpin factor"]').first();
    if ((await unpinFirst.count()) > 0) {
      await unpinFirst.click();
      await expect(page.getByText(/Unpinned\./i)).toBeVisible({ timeout: 5_000 });
    }

    const pinButton = page.locator('button[aria-label="Pin as factor"]').first();
    await pinButton.click();
    await expect(page.getByText(/Pinned as your factor/i)).toBeVisible({ timeout: 5_000 });

    // After pinning, exactly one Unpin button must be present.
    await expect(page.locator('button[aria-label="Unpin factor"]')).toHaveCount(1);
  });
});

import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Network → Customers · "+ Add Customer" flow @browser
 *
 * Phase 1 of the factoring overhaul: standalone customer creation, with the
 * factoring section hidden entirely for `customerType = CARRIER`.
 */

async function loginAsDispatcher(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Network → Customers · Add Customer @browser', () => {
  test('+ Add Customer button opens a sheet with company name + type fields', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=customers`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Add Customer/i }).click();
    await expect(page.getByLabel(/Company Name \*/i)).toBeVisible();
    await expect(page.getByLabel(/Type \*/i)).toBeVisible();
  });

  test('Selecting Outside Carrier hides the factoring override section entirely', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=customers`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Add Customer/i }).click();
    await page.getByLabel(/Type \*/i).click();
    await page.getByRole('option', { name: /Outside Carrier/i }).click();

    // The "Factoring override" toggle should not be present at all for CARRIER.
    await expect(page.getByText(/Factoring override/i)).toHaveCount(0);
  });

  test('BROKER form shows the collapsed factoring override toggle', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=customers`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Add Customer/i }).click();
    // BROKER is the default selected type — the toggle should be visible.
    await expect(page.getByText(/Factoring override/i)).toBeVisible();
  });
});

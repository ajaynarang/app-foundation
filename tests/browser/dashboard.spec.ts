import { test, expect } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Browser smoke tests — dashboard and navigation @browser
 *
 * Validates that the dispatcher dashboard renders without errors
 * and navigation sidebar is functional.
 */

async function loginAsDispatcher(page: any): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Dispatcher Dashboard @browser', () => {
  test('dashboard renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err: Error) => errors.push(err.message));

    await loginAsDispatcher(page);
    await page.waitForLoadState('networkidle');

    // Dashboard should have meaningful content (not blank)
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length).toBeGreaterThan(50);

    // No uncaught JS errors
    expect(errors, `JS errors on dashboard: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('sidebar navigation has expected links', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.waitForLoadState('networkidle');

    // Sidebar should contain navigation items
    const navLinks = page.locator('nav a, aside a, [role="navigation"] a');
    const count = await navLinks.count();
    expect(count, 'Sidebar should have multiple nav links').toBeGreaterThan(3);
  });

  test('no 500 errors in network requests', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('response', (response: any) => {
      if (response.status() >= 500) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await loginAsDispatcher(page);
    await page.waitForLoadState('networkidle');

    expect(failedRequests, `Server errors: ${failedRequests.join('; ')}`).toHaveLength(0);
  });
});

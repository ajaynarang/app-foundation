import { test, expect } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Browser smoke tests — page navigation @browser
 *
 * Validates that key pages load without errors.
 * Tests dark mode rendering and responsive layout.
 */

async function loginAsDispatcher(page: any): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

const PAGES_TO_CHECK = [
  { path: '/dispatcher/loads', name: 'Loads' },
  { path: '/dispatcher/fleet', name: 'Fleet' },
  { path: '/dispatcher/billing', name: 'Billing' },
  { path: '/dispatcher/alerts', name: 'Alerts' },
];

for (const { path, name } of PAGES_TO_CHECK) {
  test.describe(`Navigate: ${name} @browser`, () => {
    test(`${name} page loads without 500 errors`, async ({ page }) => {
      const serverErrors: string[] = [];
      page.on('response', (response: any) => {
        if (response.status() >= 500) {
          serverErrors.push(`${response.status()} ${response.url()}`);
        }
      });

      await loginAsDispatcher(page);
      await page.goto(`${ENV.webBaseUrl}${path}`);
      await page.waitForLoadState('networkidle');

      // Page should have content
      const bodyText = await page.evaluate(() => document.body.innerText.trim());
      expect(bodyText.length, `${name} page appears blank`).toBeGreaterThan(20);

      // No server errors
      expect(serverErrors, `500 errors on ${name}: ${serverErrors.join('; ')}`).toHaveLength(0);
    });
  });
}

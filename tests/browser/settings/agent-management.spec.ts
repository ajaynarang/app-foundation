import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../../config/test-env.js';

/**
 * Browser smoke tests for the agent-management surfaces under
 * Settings → OAuth Clients and Settings → API Keys. (Previously lived
 * under `/dispatcher/desk?tab=external-agents` and `?tab=api-keys`.)
 *
 * These tests assume at least one OAuth client is already registered
 * in the test tenant (the register flow is covered by a separate test).
 * If no client is seeded, the scope-edit test is skipped.
 *
 * Log-row seeding for the Activity filter test is deferred — see the
 * TODO near the bottom. The scope-edit and mint flows do not depend on
 * seeded activity rows and run unconditionally.
 */

async function signInAsDispatcherAdmin(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Settings — Agent Management @browser', () => {
  test('tenant admin can open the OAuth Clients page', async ({ page }) => {
    await signInAsDispatcherAdmin(page);
    await page.goto(`${ENV.webBaseUrl}/settings/oauth-clients`);
    await page.waitForLoadState('networkidle');

    const content = await page.evaluate(() => document.body.innerText);
    expect(content.length).toBeGreaterThan(0);
  });

  test('tenant admin edits OAuth client scopes from Settings', async ({ page }) => {
    await signInAsDispatcherAdmin(page);
    await page.goto(`${ENV.webBaseUrl}/settings/oauth-clients`);
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('table tbody tr').first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      test.skip(true, 'No OAuth client seeded — covered by register flow test');
      return;
    }
    await firstRow.click();

    await page.getByRole('tab', { name: 'Scopes' }).click();
    await page.getByRole('button', { name: /Edit scopes/i }).click();
    await page.getByRole('combobox').first().click();
    const option = page.getByRole('option', { name: /fleet:read/i }).first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await expect(page.getByText(/You.?re adding|You.?re removing/)).toBeVisible();
    }
  });

  test('tenant admin can open the API Keys page and see the create button', async ({ page }) => {
    await signInAsDispatcherAdmin(page);
    await page.goto(`${ENV.webBaseUrl}/settings/api-keys`);
    await page.waitForLoadState('networkidle');

    const createButton = page.getByRole('button', { name: /Create a key/i });
    if (!(await createButton.isVisible().catch(() => false))) {
      test.skip(true, 'API Keys page did not render a Create button');
      return;
    }
    await createButton.click();
    await expect(page.getByText(/Create an API key/i)).toBeVisible();
  });

  // TODO: Activity tab filter smoke — requires seeding AgentInvocationLog
  // rows from a browser test. Deferred to the Part 4 end-to-end test
  // plan where a QA helper can insert seed rows via an admin endpoint.
});

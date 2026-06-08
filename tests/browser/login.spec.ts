import { test, expect } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Browser smoke tests — login flow @browser
 *
 * Validates the real user login experience through the browser.
 * Uses actual credentials (not dev-switcher) since we're testing the full UI auth flow.
 */

test.describe('Login Flow @browser', () => {
  test('dispatcher can login and reach dashboard', async ({ page }) => {
    await page.goto(`${ENV.webBaseUrl}/login`);
    await page.waitForLoadState('networkidle');

    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');

    await emailInput.fill(ENV.dispatcherEmail);
    await passwordInput.fill(ENV.dispatcherPassword);
    await page.click('button[type="submit"]');

    // Should redirect to dispatcher area
    await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
    expect(page.url()).toContain('/dispatcher');
  });

  test('super admin can login and reach admin area', async ({ page }) => {
    await page.goto(`${ENV.webBaseUrl}/login`);
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');

    await emailInput.fill(ENV.superAdminEmail);
    await passwordInput.fill(ENV.superAdminPassword);
    await page.click('button[type="submit"]');

    // Should redirect to admin area
    await page.waitForURL('**/{super-admin,admin}/**', { timeout: 20_000 });
    const url = page.url();
    expect(url.includes('admin')).toBeTruthy();
  });

  test('invalid credentials show error (no redirect)', async ({ page }) => {
    await page.goto(`${ENV.webBaseUrl}/login`);
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');

    await emailInput.fill('fake@nonexistent.dev');
    await passwordInput.fill('wrongpassword');
    await page.click('button[type="submit"]');

    // Should stay on login page
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/login');
  });
});

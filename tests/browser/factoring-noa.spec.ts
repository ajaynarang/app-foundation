import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Factoring NOA (Phase 3.5) @browser
 *
 * Verifies the NOA frontend polish:
 *   - NOA inbox loads at /dispatcher/network?tab=noa
 *   - Filters render and are reachable
 *   - Send-NOA dialog opens from the inbox and closes on Cancel
 *   - Submit-to-factor dialog renders the NOA gate section
 *   - NOA section is present on broker customer detail and absent on CARRIER
 *
 * Tests skip when the local seed has no FACTORED invoices / NOAs (mirrors
 * the empty-seed pattern in factoring-bundle.spec.ts). The QA suite owns
 * the full happy-path with seeded data + S3 + Resend stubs.
 */

async function loginAsDispatcher(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Factoring NOA · Phase 3.5 wiring @browser', () => {
  test('NOA inbox tab loads with filters at /dispatcher/network?tab=noa', async ({ page }) => {
    await loginAsDispatcher(page);

    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=noa`);
    await page.waitForLoadState('networkidle');

    // The NOA Inbox tab trigger should be active.
    const noaTab = page.getByRole('tab', { name: /NOA Inbox/i });
    await expect(noaTab).toHaveAttribute('data-state', 'active', { timeout: 10_000 });

    // The three filter selects must render.
    await expect(page.getByLabel('Filter by status')).toBeVisible();
    await expect(page.getByLabel('Filter by age')).toBeVisible();
    await expect(page.getByLabel('Filter by factor')).toBeVisible();

    // Either rows render OR the empty-state copy renders — both are valid.
    const emptyState = page.getByText(/No NOAs match these filters/i);
    const tableHeaderCustomer = page.getByRole('columnheader', { name: /^Customer$/i });
    const visible = (await tableHeaderCustomer.count()) > 0 || (await emptyState.count()) > 0;
    expect(visible).toBe(true);
  });

  test('Send NOA dialog opens from the inbox and closes on Cancel', async ({ page }) => {
    await loginAsDispatcher(page);

    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=noa`);
    await page.waitForLoadState('networkidle');

    const sendButton = page.getByRole('button', { name: /^Send NOA to /i }).first();
    if ((await sendButton.count()) === 0) {
      test.skip(true, 'No NOT_SENT NOAs in the seed; skipping send-dialog assertion.');
      return;
    }

    await sendButton.click();

    await expect(page.getByRole('heading', { name: /Send Notice of Assignment/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Letter preview/i)).toBeVisible();

    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await expect(page.getByRole('heading', { name: /Send Notice of Assignment/i })).toHaveCount(0);
  });

  test('Submit-to-factor dialog renders the NOA gate section', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/billing`);
    await page.waitForLoadState('networkidle');

    const submitTrigger = page.getByRole('button', { name: /Submit to factor/i }).first();
    if ((await submitTrigger.count()) === 0) {
      test.skip(true, 'No FACTORED-path invoice in the seed; skipping NOA-gate assertion.');
      return;
    }
    await submitTrigger.click();

    await expect(page.getByRole('heading', { name: /Submit to Factor/i })).toBeVisible({ timeout: 10_000 });

    // The NOA section header must render (label is the canonical one used in the dialog).
    await expect(page.getByText(/Notice of Assignment \(NOA\)/i)).toBeVisible();

    // The submit button is reachable. We don't assert the disabled state here
    // because it depends on the seeded NOA's status.
    const submitButton = page.getByRole('button', { name: /Submit to Factor$/i });
    await expect(submitButton).toBeVisible();
  });

  test('NOA section visibility on customer detail (broker shows, carrier hides)', async ({ page }) => {
    await loginAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/network?tab=customers`);
    await page.waitForLoadState('networkidle');

    // Open the first customer row's detail sheet.
    const firstCustomer = page.getByRole('row').nth(1);
    if ((await firstCustomer.count()) === 0) {
      test.skip(true, 'No customers in the seed; skipping NOA-section assertion.');
      return;
    }
    await firstCustomer.click();

    // Wait for the detail sheet to render.
    await page.waitForTimeout(500);

    // Read the customer-type badge — drives the assertion direction.
    const carrierBadge = page.getByText(/Outside Carrier/i).first();
    const noaSectionHeader = page.getByText(/Notice of Assignment/i).first();

    if ((await carrierBadge.count()) > 0) {
      await expect(noaSectionHeader).toHaveCount(0);
    } else {
      await expect(noaSectionHeader).toBeVisible({ timeout: 5_000 });
    }
  });
});

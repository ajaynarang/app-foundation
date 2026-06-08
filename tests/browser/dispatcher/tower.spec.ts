import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../../config/test-env.js';

/**
 * Browser golden-path test — Tower v3 canvas @browser
 *
 * The QA phase deferred by the Tower v3 plan
 * (`.docs/plans/04-operations/2026-04-28-tower-v3-design.md` lines 716-721:
 * "browser golden-path open tower → click load → close").
 *
 * Golden path: a dispatcher opens `/dispatcher/tower`, the 3-column canvas
 * renders (spine + map + wire), they open the bottom loads drawer, click an
 * active-load row, a load-detail sheet opens, and they close it again.
 *
 * Kept SMOKE-level — a happy path, not exhaustive. The loads drawer is the
 * deterministic entry point: each row is a `<button aria-label="Open load …">`
 * (no `data-testid` exists anywhere in the Tower feature, so we rely on roles
 * + accessible names, matching the other browser specs). If the test tenant
 * has no active loads the drawer is empty — the load-open + close steps then
 * skip rather than fail, so the test stays portable against stale demo data.
 *
 * Auth follows the repo's browser convention (see dashboard/navigation specs):
 * a real `/login` round-trip with the `ENV` dispatcher credentials — NOT the
 * JWT-injection fixture (that pattern is API-suite only here).
 */

async function signInAsDispatcher(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

test.describe('Dispatcher — Tower v3 golden path @browser', () => {
  test('opens the Tower canvas, drills into a load, and closes the detail', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    // 1 ── open the Tower page ────────────────────────────────────────────────
    await signInAsDispatcher(page);
    await page.goto(`${ENV.webBaseUrl}/dispatcher/tower`);
    await page.waitForLoadState('networkidle');

    // 2 ── the 3-column canvas renders — the driver spine is an accessible
    //      landmark (`<section aria-label="Drivers spine">`). Its presence
    //      proves the canvas mounted (not the <900px handoff screen).
    const spine = page.getByRole('region', { name: /drivers spine/i });
    await expect(spine).toBeVisible({ timeout: 15_000 });

    // The canvas has meaningful content (not a blank crash).
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length, 'Tower page appears blank').toBeGreaterThan(50);

    // 3 ── open the bottom loads drawer via its handle button. The handle
    //      label flips between "Show active loads" / "Hide active loads".
    const drawerHandle = page.getByRole('button', { name: /show active loads/i });
    await expect(drawerHandle).toBeVisible({ timeout: 10_000 });
    await drawerHandle.click();

    // The drawer is a bottom Sheet titled "Active loads".
    const drawerTitle = page.getByRole('heading', { name: /^active loads$/i });
    await expect(drawerTitle).toBeVisible({ timeout: 10_000 });

    // 4 ── click the first active-load row, if any. Each row is a button with
    //      an `aria-label="Open load <number>"`. On a tenant with no active
    //      loads the drawer is empty — skip the drill-in cleanly.
    const loadRow = page.getByRole('button', { name: /^open load /i }).first();
    if (await loadRow.isVisible().catch(() => false)) {
      await loadRow.click();

      // 5 ── the load-detail sheet opens — assert via its close affordance
      //      (the Radix Sheet renders a button with sr-only text "Close").
      const closeButton = page.getByRole('button', { name: /^close$/i });
      await expect(closeButton).toBeVisible({ timeout: 10_000 });

      // 6 ── close the detail sheet — the canvas remains mounted.
      await closeButton.click();
      await expect(closeButton).toBeHidden({ timeout: 10_000 });
      await expect(spine).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Test tenant has no active loads — load drill-in + close steps skipped.',
      });
    }

    // No server errors across the whole journey.
    expect(serverErrors, `500 errors on Tower: ${serverErrors.join('; ')}`).toHaveLength(0);
  });
});

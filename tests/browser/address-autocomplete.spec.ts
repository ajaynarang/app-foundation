import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../config/test-env.js';

/**
 * Address Autocomplete — tier-3 HERE Autosuggest in the stop picker @browser
 *
 * Feature PRs #749–#753. The StopLocationPicker gained a third "Suggestions"
 * CommandGroup that calls HERE Autosuggest when the tenant's own Stop master
 * returns < 5 hits. Gated by the `places_autocomplete` feature flag (seeded ON).
 *
 * Targets the picker as reached from the New Load form. The picker's empty
 * state is a combobox-role button labelled "Search locations or type an
 * address…"; opening it reveals a CommandInput placeholdered
 * "Search by name, address, or city…". Tier-3 results render in a CommandGroup
 * with the heading "Suggestions".
 */

async function loginAsDispatcher(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[name="email"]', ENV.dispatcherEmail);
  await page.fill('input[type="password"], input[name="password"]', ENV.dispatcherPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dispatcher/**', { timeout: 20_000 });
}

async function openNewLoadForm(page: Page): Promise<void> {
  await page.goto(`${ENV.webBaseUrl}/dispatcher/loads`);
  await page.waitForLoadState('networkidle');
  await page
    .getByRole('button', { name: /New Load/i })
    .first()
    .click();
}

/** Open the first stop picker on screen and return its CommandInput locator. */
async function openFirstStopPicker(page: Page) {
  await page
    .getByRole('combobox', { name: /Search locations or type an address/i })
    .first()
    .click();
  const input = page.getByPlaceholder(/Search by name, address, or city/i);
  await expect(input).toBeVisible();
  return input;
}

test.describe('Address autocomplete — stop picker tier-3 @browser', () => {
  test('typing a fresh address surfaces a HERE "Suggestions" group', async ({ page }) => {
    await loginAsDispatcher(page);
    await openNewLoadForm(page);

    const input = await openFirstStopPicker(page);
    // A novel address the tenant's own Stop master is unlikely to have — forces tier-3.
    await input.fill('1245 industrial blvd dallas');

    // HERE Autosuggest is debounced 200ms + a network round-trip.
    await expect(page.getByRole('group', { name: /Suggestions/i })).toBeVisible({ timeout: 10_000 });
  });

  test('picking a suggestion fills the stop and closes the picker', async ({ page }) => {
    await loginAsDispatcher(page);
    await openNewLoadForm(page);

    const input = await openFirstStopPicker(page);
    await input.fill('1600 amphitheatre pkwy mountain view');

    const suggestions = page.getByRole('group', { name: /Suggestions/i });
    await expect(suggestions).toBeVisible({ timeout: 10_000 });

    await suggestions.getByRole('option').first().click();

    // The command input is no longer visible once a stop is selected.
    await expect(page.getByPlaceholder(/Search by name, address, or city/i)).toBeHidden({ timeout: 10_000 });

    // First-time resolution of a brand-new place persists a Stop → success toast.
    // Tolerant: a repeat run that matches an existing Stop emits no toast.
    const toast = page.getByText(/Location saved/i);
    if (await toast.isVisible().catch(() => false)) {
      await expect(toast).toBeVisible();
    }
  });

  test('a junk query yields no suggestions and no error toast', async ({ page }) => {
    await loginAsDispatcher(page);
    await openNewLoadForm(page);

    const input = await openFirstStopPicker(page);
    await input.fill('zzzqqxnotaplace');

    // Let the debounce + request settle, then assert the group is absent.
    await page.waitForTimeout(2_000);
    await expect(page.getByRole('group', { name: /Suggestions/i })).toHaveCount(0);
    await expect(page.getByText(/Could not save location/i)).toHaveCount(0);
  });

  test('a 2-character query does not trigger tier-3 (min length is 3)', async ({ page }) => {
    await loginAsDispatcher(page);
    await openNewLoadForm(page);

    const input = await openFirstStopPicker(page);
    await input.fill('da');

    await page.waitForTimeout(1_500);
    await expect(page.getByRole('group', { name: /Suggestions/i })).toHaveCount(0);
  });
});

import { defineConfig } from '@playwright/test';
import { ENV } from './config/test-env.js';
import { detectCapabilities, detectDataCapabilities, buildGrepInvert } from './config/detect-capabilities.js';

// ── Capability detection (runs before test collection) ────────────────────────
//
// playwright.config.ts is an ES module and supports top-level await, so we
// can resolve grepInvert here — before any test file is parsed. This means
// @requires:plan-X tests are excluded at collection time, not at runtime, which
// avoids noisy "skipped" counts in the report.
//
// If detection fails (backend not running, no TENANT_ID) we fall back to no
// filtering so the full suite runs. Warnings are logged but never fatal here.

async function resolveGrepInvert(): Promise<RegExp | undefined> {
  if (!ENV.tenantId) return undefined;

  // Data capabilities are env-driven (TESTS_DATA_CAPABILITIES) — resolve these
  // even when plan detection fails. They're independent of backend reachability.
  const data = detectDataCapabilities();

  let disabledPlan: Set<string> = new Set();
  try {
    const caps = await detectCapabilities(ENV.apiBaseUrl, ENV.tenantId);
    disabledPlan = caps.disabled;

    if (disabledPlan.size > 0) {
      const tagList = [...disabledPlan].map((f) => `plan-${f}`).join(', ');
      console.log(
        `[QA] Tenant "${ENV.tenantId}" — ${disabledPlan.size} disabled feature(s): ${tagList}. ` +
          `Tests tagged @requires:plan-<feature> for these will be excluded from collection.`,
      );
    } else {
      console.log(`[QA] Tenant "${ENV.tenantId}" — all plan features enabled.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[QA] Could not detect tenant plan capabilities (${msg}). Plan gating disabled.`);
  }

  if (data.missing.size > 0) {
    const tagList = [...data.missing].map((k) => `data-${k}`).join(', ');
    console.log(
      `[QA] Missing data capabilities (${data.missing.size}): ${tagList}. ` +
        `Tests tagged @requires:data-<kind> for these will be excluded from collection. ` +
        `Set TESTS_DATA_CAPABILITIES=<csv> (or ENABLE_ALL_TESTS=1) to override.`,
    );
  } else if (process.env.TESTS_DATA_CAPABILITIES || process.env.ENABLE_ALL_TESTS === '1') {
    console.log('[QA] All known data capabilities present. No @requires:data-* exclusions.');
  }

  return buildGrepInvert(disabledPlan, data.missing);
}

const grepInvert = await resolveGrepInvert();

// ── Config ────────────────────────────────────────────────────────────────────

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/results.json' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
  ],

  globalSetup: './config/global-setup.ts',

  // Exclude tests tagged with @requires:plan-X when the tenant lacks that feature.
  // undefined means no filter — all tests run.
  grepInvert,

  use: {
    baseURL: ENV.apiBaseUrl,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'api',
      testMatch: ['smoke/**/*.spec.ts', 'rbac/**/*.spec.ts'],
    },
  ],
});

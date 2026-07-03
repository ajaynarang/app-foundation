/**
 * Central environment configuration for the QA suite.
 *
 * THIS IS THE ONLY FILE THAT DEFINES DEFAULTS.
 *
 * Every consumer (playwright.config.ts, scripts/*, loadtest/*) must import
 * ENV from here — never re-read process.env with its own fallback. Doing
 * so creates drift bugs (we've been burned twice).
 *
 * Local values default to ports 8000/3000 which match `pnpm dev` for the
 * backend and web apps. Staging values come from CI workflow inputs.
 */
export const ENV = {
  /** API base URL. Local backend runs on 8000. */
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8000/api/v1',

  /** Frontend base URL for browser tests. Local web runs on 3000. */
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',

  /** Required at runtime: tenant slug (not DB id) to target. Use pnpm qa:list-tenants to discover. */
  tenantId: process.env.TENANT_ID || 'demo' /* seeded demo tenant */,

  /** Browser test credentials */
  memberEmail: process.env.TEST_MEMBER_EMAIL || 'member@example.com',
  memberPassword: process.env.TEST_MEMBER_PASSWORD || 'test1234',
  superAdminEmail: process.env.TEST_SUPER_ADMIN_EMAIL || 'admin@example.com',
  superAdminPassword: process.env.TEST_SUPER_ADMIN_PASSWORD || 'changeme',
} as const;

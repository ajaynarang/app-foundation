/**
 * Central environment configuration for the QA suite.
 *
 * THIS IS THE ONLY FILE THAT DEFINES DEFAULTS.
 *
 * Every consumer (playwright.config.ts, scripts/*, loadtest/*) must import
 * ENV from here — never re-read process.env with its own fallback. Doing
 * so creates drift bugs (we've been burned twice).
 *
 * Local values default to ports 8001/3001 which match `pnpm dev` for the
 * backend and web apps. Staging values come from CI workflow inputs.
 */
export const ENV = {
  /** API base URL. Local backend runs on 8001. */
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8001/api/v1',

  /** Frontend base URL for browser tests. Local web runs on 3001. */
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:3001',

  /** Required at runtime: tenant slug (not DB id) to target. Use pnpm qa:list-tenants to discover. */
  tenantId: process.env.TENANT_ID || '',

  /** Browser test credentials */
  dispatcherEmail: process.env.TEST_DISPATCHER_EMAIL || 'ajaynarang.local@outlook.com',
  dispatcherPassword: process.env.TEST_DISPATCHER_PASSWORD || 'test1234',
  superAdminEmail: process.env.TEST_SUPER_ADMIN_EMAIL || 'admin@sally.com',
  superAdminPassword: process.env.TEST_SUPER_ADMIN_PASSWORD || 'SallyAdmin@2026',
} as const;

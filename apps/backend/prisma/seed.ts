/**
 * Legacy seed entry point.
 *
 * Kept for backward compatibility with `prisma migrate reset`
 * and `pnpm run db:seed`. Delegates to the unified seed orchestrator.
 *
 * Preferred commands:
 *   pnpm run setup:base   — platform reference data (flags, plans, etc.)
 *   pnpm run setup:reset  — wipe and re-seed (guarded by environment checks)
 *   pnpm run setup:status — show what's been seeded
 */

require('./seeds/index');

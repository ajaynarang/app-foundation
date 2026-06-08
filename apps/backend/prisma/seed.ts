/**
 * Legacy seed entry point.
 *
 * Kept for backward compatibility with `prisma migrate reset`
 * and `pnpm run db:seed`. Delegates to the unified seed orchestrator.
 *
 * Preferred commands:
 *   pnpm run setup:base   — platform reference data (flags, plans, stops, etc.)
 *   pnpm run setup:demo   — demo tenant with sample fleet data
 *   pnpm run setup:status — show what's been seeded
 */

require('./seeds/index');

/**
 * @appshore/db — the single Prisma client for the monorepo.
 *
 * Generated from prisma/schema/*.prisma (foundation.prisma is AppShore-owned;
 * app.prisma is your domain extension point). Everything that needs Prisma —
 * @appshore/platform and your app domains — imports from THIS package, never
 * from '@prisma/client' directly, so there is exactly one client instance.
 *
 * Regenerate: pnpm --filter @appshore/db prisma:generate
 */
export * from '../generated/client';

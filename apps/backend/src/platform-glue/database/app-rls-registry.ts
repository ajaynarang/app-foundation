import { mergeRlsRegistry, type RlsTableEntry } from '@appshore/platform/infrastructure/database/rls-registry';

/**
 * YOUR tables' tenant class, one entry per model in `packages/appshore/db/prisma/schema/app.prisma`, keyed by table
 * name (`@@map`). The classes and what each requires of the `tenantId` column are documented in
 * `@appshore/platform/infrastructure/database/rls-registry.ts`. A model with no entry fails
 * `architecture/rls-registry.spec.ts`, so a new table decides its class in the pull request that adds it.
 *
 *   export const APP_RLS_REGISTRY = {
 *     orders: { class: 'tenant' },
 *     order_lines: { class: 'child', parent: 'orders' },
 *   };
 */
export const APP_RLS_REGISTRY: Readonly<Record<string, RlsTableEntry>> = {};

/** Every table's class: the foundation's and the app's. */
export const RLS_REGISTRY = mergeRlsRegistry(APP_RLS_REGISTRY);

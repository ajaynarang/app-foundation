/**
 * Shared pagination utility. Clamps limit to prevent abuse.
 * Import in any service that accepts pagination params.
 */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 500;

export function clampPagination(pagination?: { limit?: number; offset?: number }): { take: number; skip: number } {
  return {
    take: Math.min(Math.max(pagination?.limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT),
    skip: Math.max(pagination?.offset ?? 0, 0),
  };
}

import { buildKey } from '../../../infrastructure/cache/cache-key.constants';

/**
 * Cache namespace for login activity. The summary endpoint is the only
 * cacheable surface; the list endpoint is filter-heavy so we don't cache it.
 */
export const LOGIN_ACTIVITY_CACHE_NAMESPACE = 'app:login-activity';

/**
 * Stable, sorted string for the `roles` filter so two requests with the same
 * roles in different orders share a cache entry. `'all'` is used as the
 * sentinel for "no roles filter" — `buildKey` rejects empty segments.
 */
export function rolesKey(roles?: string[]): string {
  if (!roles || roles.length === 0) return 'all';
  return [...roles].sort().join(',');
}

export const loginActivityCacheKeys = {
  /**
   * Cross-tenant summary keys use the literal `'all'` for the tenant segment
   * so super-admin (no tenantId) and tenant-scoped requests live under
   * distinct keys.
   *
   * `excludeSuperAdmin` is part of the key so the "Tenants only" toggle
   * (Super Admin page) doesn't collide with the all-roles cache entry.
   */
  summary: (params: {
    tenantId?: number;
    from: string;
    to: string;
    rolesKey: string;
    excludeSuperAdmin: boolean;
  }): string =>
    buildKey(
      LOGIN_ACTIVITY_CACHE_NAMESPACE,
      'summary',
      params.tenantId ?? 'all',
      params.from,
      params.to,
      params.rolesKey,
      params.excludeSuperAdmin ? 'no-super' : 'all-roles',
    ),
};

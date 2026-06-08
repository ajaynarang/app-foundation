/**
 * Login activity TanStack Query hooks (read-only).
 *
 * Both queries use the centralized `queryKeys.loginActivity.*` factory.
 * The list query uses `placeholderData: keepPreviousData` to prevent
 * pagination/filter flicker.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { apiClient } from '@/shared/lib/api';
import { loginActivityApi } from './api';
import type { ListLoginActivityQuery, LoginActivityScope, LoginActivitySummaryQuery } from './types';

export function useLoginActivityList(scope: LoginActivityScope, params: ListLoginActivityQuery) {
  return useQuery({
    queryKey: queryKeys.loginActivity.list(scope, params as Record<string, unknown>),
    queryFn: () => loginActivityApi.list(scope, params),
    placeholderData: keepPreviousData,
  });
}

export function useLoginActivitySummary(scope: LoginActivityScope, params: LoginActivitySummaryQuery) {
  return useQuery({
    queryKey: queryKeys.loginActivity.summary(scope, params as Record<string, unknown>),
    queryFn: () => loginActivityApi.summary(scope, params),
  });
}

export interface TenantListItem {
  id: number;
  companyName: string;
}

/**
 * Super-admin only — fetches the tenant list used by the tenant filter dropdown.
 * Reuses the existing `GET /tenants` endpoint and the shared `admin.tenants` key
 * so we don't double-cache. Tenant counts in v1 are small enough to render the
 * whole list without server-side search.
 */
export function useTenantList(enabled: boolean) {
  return useQuery<TenantListItem[]>({
    queryKey: queryKeys.admin.tenants,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await apiClient<any>('/tenants');
      const list = data?.tenants ?? data ?? [];
      return (list as Array<{ id: number; companyName: string }>).map((t) => ({
        id: t.id,
        companyName: t.companyName,
      }));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

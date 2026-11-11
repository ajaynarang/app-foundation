import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@appshore/web-core/shared/constants';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { developerScopesApi, type ScopeReferenceEntry } from '../api';

/**
 * The scope vocabulary with live sample tools from the backend registry.
 * Off by default: the reference fetches only once someone opens it.
 */
export function useScopeReference({ enabled = false }: { enabled?: boolean } = {}) {
  return useQuery<ScopeReferenceEntry[]>({
    queryKey: queryKeys.developerScopes.root,
    queryFn: developerScopesApi.list,
    enabled,
    ...QUERY_TIERS.STATIC,
  });
}

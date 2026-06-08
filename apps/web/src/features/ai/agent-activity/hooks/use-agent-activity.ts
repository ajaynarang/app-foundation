import { useInfiniteQuery } from '@tanstack/react-query';
import type { AgentActivityFilter, AgentPrincipalKind } from '@app/shared-types';
import { queryKeys } from '@/shared/constants';
import { agentActivityApi } from '../api';

interface UseAgentActivityParams {
  principalKind: AgentPrincipalKind;
  principalId: string;
  filter: AgentActivityFilter;
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
}

/**
 * Cursor-paginated agent invocation activity for a principal.
 * Uses useInfiniteQuery — pages load on demand via fetchNextPage.
 */
export function useAgentActivity(params: UseAgentActivityParams) {
  const { enabled = true, ...queryParams } = params;
  return useInfiniteQuery({
    queryKey: queryKeys.agentActivity.list(queryParams),
    queryFn: ({ pageParam }) =>
      agentActivityApi.list({
        principalKind: queryParams.principalKind,
        principalId: queryParams.principalId,
        filter: queryParams.filter,
        dateFrom: queryParams.dateFrom,
        dateTo: queryParams.dateTo,
        cursor: (pageParam as string | null) ?? null,
        limit: 50,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

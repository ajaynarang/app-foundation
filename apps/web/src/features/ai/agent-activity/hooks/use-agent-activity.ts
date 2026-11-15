import type { AgentActivityFilter, AgentPrincipalKind } from '@app/shared-types';
import { queryKeys } from '@appshore/web-core/shared/constants';
import { useCursorList } from '@appshore/web-core/shared/list';
import { agentActivityApi } from '../api';

interface UseAgentActivityParams {
  principalKind: AgentPrincipalKind;
  principalId: string;
  filter: AgentActivityFilter;
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
}

/** Agent invocation activity for a principal, newest first: a cursor list ("Load more"). */
export function useAgentActivity(params: UseAgentActivityParams) {
  const { enabled = true, ...queryParams } = params;
  return useCursorList({
    queryKey: queryKeys.agentActivity.list(queryParams),
    queryFn: (cursor) => agentActivityApi.list({ ...queryParams, cursor }),
    enabled,
  });
}

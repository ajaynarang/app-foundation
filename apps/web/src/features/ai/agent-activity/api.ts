import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { AgentActivityFilter, AgentActivityPage, AgentPrincipalKind } from '@app/shared-types';

export interface AgentActivityQueryParams {
  principalKind: AgentPrincipalKind;
  principalId: string;
  filter: AgentActivityFilter;
  cursor?: string | null;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}

export const agentActivityApi = {
  list: (params: AgentActivityQueryParams): Promise<AgentActivityPage> => {
    const qs = new URLSearchParams({
      principalKind: params.principalKind,
      principalId: params.principalId,
      filter: params.filter,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.limit ? { limit: String(params.limit) } : {}),
      ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params.dateTo ? { dateTo: params.dateTo } : {}),
    });
    return apiClient<AgentActivityPage>(`/agent-activity?${qs.toString()}`);
  },
};

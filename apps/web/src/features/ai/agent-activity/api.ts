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

// Query keys are snake_case on the wire; the params object stays camelCase.
export const agentActivityApi = {
  list: (params: AgentActivityQueryParams): Promise<AgentActivityPage> => {
    const qs = new URLSearchParams({
      principal_kind: params.principalKind,
      principal_id: params.principalId,
      filter: params.filter,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.limit ? { limit: String(params.limit) } : {}),
      ...(params.dateFrom ? { date_from: params.dateFrom } : {}),
      ...(params.dateTo ? { date_to: params.dateTo } : {}),
    });
    return apiClient<AgentActivityPage>(`/agent-activity?${qs.toString()}`);
  },
};

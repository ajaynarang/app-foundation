import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { AgentAction, AgentPolicy, UpdateAgentPolicyInput } from '@app/shared-types';

const path = (token: string) => `/agent-actions/${encodeURIComponent(token)}`;

/** An external agent's write waiting for a person, and the workspace switch that decides whether it waits. */
export const agentActionsApi = {
  get: (token: string) => apiClient<AgentAction>(path(token)),
  approve: (token: string) => apiClient<AgentAction>(`${path(token)}/approve`, { method: 'POST' }),
  deny: (token: string) => apiClient<AgentAction>(`${path(token)}/deny`, { method: 'POST' }),
  /** A sensitive write: the person the agent acts for confirms with their PIN. */
  stepUp: (token: string, pin: string) =>
    apiClient<{ status: 'step_up_verified' }>(`/mcp/hitl/${encodeURIComponent(token)}/step-up`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  getPolicy: () => apiClient<AgentPolicy>('/agent-policy'),
  updatePolicy: (data: UpdateAgentPolicyInput) =>
    apiClient<AgentPolicy>('/agent-policy', { method: 'PUT', body: JSON.stringify(data) }),
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@sally/ui';

import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';

import { deskApi } from '../api';
import type { AgentActivityWindow, UpdateAgentRequest } from '../types';

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.desk.agents(),
    queryFn: () => deskApi.agents.list(),
  });
}

export function useAgent(key: string | null | undefined) {
  return useQuery({
    queryKey: key ? queryKeys.desk.agent(key) : queryKeys.desk.agent('__inactive__'),
    queryFn: () => deskApi.agents.get(key!),
    enabled: Boolean(key),
  });
}

export function useAgentActivity(key: string | null | undefined, window: AgentActivityWindow = '7d') {
  return useQuery({
    queryKey: key ? queryKeys.desk.agentActivity(key, window) : queryKeys.desk.agentActivity('__inactive__', window),
    queryFn: () => deskApi.agents.activity(key!, window),
    enabled: Boolean(key),
  });
}

export function useEligibleSupervisors(enabled = true) {
  return useQuery({
    queryKey: queryKeys.desk.eligibleSupervisors(),
    queryFn: () => deskApi.agents.eligibleSupervisors(),
    enabled,
  });
}

/**
 * Update an agent — bulk enable + supervisor rebind. Cache-busts roster,
 * detail, and all windowed activity for this agent.
 */
export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; body: UpdateAgentRequest }) => deskApi.agents.update(input.key, input.body),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.desk.agent(variables.key) });
      qc.invalidateQueries({ queryKey: ['desk', 'agents', variables.key, 'activity'] });
      qc.invalidateQueries({ queryKey: queryKeys.desk.responsibilities() });
      showSuccess('Agent updated');
    },
    onError: (error: Error) => {
      showError('Failed to update agent', extractErrorMessage(error));
    },
  });
}

/**
 * Legacy name retained for existing callers. Delegates to `useUpdateAgent`.
 * Prefer `useUpdateAgent` in new code.
 */
export function useBulkToggleAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; body: UpdateAgentRequest }) => deskApi.agents.update(input.key, input.body),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.desk.agent(variables.key) });
      qc.invalidateQueries({ queryKey: queryKeys.desk.responsibilities() });
      const count = result.updatedResponsibilityCount;
      showSuccess(
        variables.body.enabled
          ? `Agent resumed — ${count} responsibilities`
          : `Agent paused — ${count} responsibilities`,
      );
    },
    onError: (error: Error) => {
      showError('Failed to update agent', extractErrorMessage(error));
    },
  });
}

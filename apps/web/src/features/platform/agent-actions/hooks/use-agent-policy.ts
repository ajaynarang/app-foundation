'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { showError, showSuccess } from '@app/ui';
import type { AgentPolicy } from '@app/shared-types';
import { agentActionsApi } from '../api';

/** Read by an owner or admin only: the API refuses everyone else, so the query is off for them. */
export function useAgentPolicy(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.agentPolicy.root, queryFn: agentActionsApi.getPolicy, enabled });
}

export function useUpdateAgentPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentPolicy) => agentActionsApi.updatePolicy(data),
    onSuccess: (policy) => {
      queryClient.setQueryData(queryKeys.agentPolicy.root, policy);
      showSuccess(
        policy.selfConfirm
          ? 'Agents now confirm their own standard writes'
          : 'Agent writes wait for a person to approve them again',
      );
    },
    onError: (error: Error) => showError('Could not change how agent writes are approved', extractErrorMessage(error)),
  });
}

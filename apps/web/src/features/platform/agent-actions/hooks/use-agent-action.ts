'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { showError, showSuccess } from '@app/ui';
import type { AgentAction } from '@app/shared-types';
import { agentActionsApi } from '../api';
import { isFinalError } from '../lib/is-final-error';

export function useAgentAction(token: string) {
  return useQuery({
    queryKey: queryKeys.agentActions.detail(token),
    queryFn: () => agentActionsApi.get(token),
    enabled: !!token,
    // An approval link sits in a background tab: when the person comes back, show what is true now (decided
    // elsewhere, or expired) before they click. A 403 or 404 will not change on retry.
    ...QUERY_TIERS.OPERATIONAL,
    retry: (failures, error) => !isFinalError(error) && failures < 1,
  });
}

/** Approve or deny. Both answer with the request as it is now, which replaces the cached copy. */
export function useDecideAgentAction(token: string) {
  const queryClient = useQueryClient();
  const settle = (action: AgentAction) => queryClient.setQueryData(queryKeys.agentActions.detail(token), action);

  const approve = useMutation({
    mutationFn: () => agentActionsApi.approve(token),
    onSuccess: (action) => {
      settle(action);
      showSuccess(`Approved. ${action.caller.label} can run it now`);
    },
    onError: (error: Error) => showError('Could not approve this request', extractErrorMessage(error)),
  });

  const deny = useMutation({
    mutationFn: () => agentActionsApi.deny(token),
    onSuccess: (action) => {
      settle(action);
      showSuccess(`Denied. ${action.caller.label} will not run it`);
    },
    onError: (error: Error) => showError('Could not deny this request', extractErrorMessage(error)),
  });

  return { approve, deny };
}

/** A sensitive write: confirm with the PIN. A wrong PIN is shown by the form; the toast covers everything else. */
export function useStepUpAgentAction(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => agentActionsApi.stepUp(token, pin),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentActions.detail(token) });
      showSuccess('Confirmed with your PIN. The agent can run it now');
    },
    onError: (error: Error) => showError('Could not confirm with your PIN', extractErrorMessage(error)),
  });
}

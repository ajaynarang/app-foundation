import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@sally/ui';

import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';

import { deskApi } from '../api';
import { APPROVAL_DECISION_LABELS } from '../constants';
import type { ApprovalScope, DecideApprovalRequest, EpisodeListItem } from '../types';

export interface UseApprovalsOptions {
  scope?: ApprovalScope;
  limit?: number;
}

export function useApprovals(options: UseApprovalsOptions = {}) {
  const { scope, limit } = options;
  return useQuery<EpisodeListItem[]>({
    queryKey: queryKeys.desk.approvals({ scope: scope ?? null, limit: limit ?? null }),
    queryFn: () => deskApi.approvals.listPending({ scope, limit }),
  });
}

/**
 * Aggregate handoff counts for the Handoffs tab's Mine/All segmented
 * control. Short stale time (30s) so the numbers re-check when the tab
 * regains focus but we don't hammer the endpoint on every render.
 *
 * Invalidated whenever an approval is decided (see `useDecideApproval`).
 */
export function useHandoffCounts() {
  return useQuery({
    queryKey: queryKeys.desk.handoffCounts(),
    queryFn: () => deskApi.approvals.counts(),
    staleTime: 30_000,
  });
}

export function useClaimApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deskApi.approvals.claim(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['desk', 'approvals'] });
      showSuccess('Approval claimed');
    },
    onError: (error: Error) => {
      showError('Failed to claim approval', extractErrorMessage(error));
    },
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: DecideApprovalRequest }) => deskApi.approvals.decide(input.id, input.body),
    onSuccess: (_r, variables) => {
      qc.invalidateQueries({ queryKey: ['desk', 'approvals'] });
      qc.invalidateQueries({ queryKey: queryKeys.desk.handoffCounts() });
      qc.invalidateQueries({ queryKey: ['desk', 'episodes'] });
      qc.invalidateQueries({ queryKey: queryKeys.desk.agents() });
      const msg =
        variables.body.decision === 'REJECTED' && variables.body.terminate
          ? 'Rejected and closed'
          : APPROVAL_DECISION_LABELS[variables.body.decision];
      showSuccess(msg);
    },
    onError: (error: Error) => {
      showError('Failed to decide approval', extractErrorMessage(error));
    },
  });
}

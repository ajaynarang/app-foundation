import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { closeOutApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import type { CloseOutListParams } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useCloseOutSummary() {
  return useQuery({
    queryKey: [...queryKeys.closeOut.root, 'summary'],
    queryFn: () => closeOutApi.getSummary(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useCloseOutLoads(params?: CloseOutListParams) {
  return useQuery({
    queryKey: [...queryKeys.closeOut.root, 'list', params],
    queryFn: () => closeOutApi.list(params),
    staleTime: 0,
  });
}

export function useApproveForBilling() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (loadId: string) => closeOutApi.approveForBilling(loadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      // billing_status is a load field — keep load detail views in sync
      qc.invalidateQueries({ queryKey: ['loads'] });
      showSuccess('Load approved for billing');
    },
    onError: (error: Error) => {
      showError('Failed to approve load', extractErrorMessage(error));
    },
  });
}

export function useBillingReadiness(loadId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.closeOut.root, 'readiness', loadId],
    queryFn: () => closeOutApi.getReadiness(loadId!),
    enabled: !!loadId,
  });
}

export function useApproveWithOverride() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, reason }: { loadId: string; reason: string }) =>
      closeOutApi.approveWithOverride(loadId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      qc.invalidateQueries({ queryKey: ['loads'] });
      showSuccess('Load approved for billing (with override)');
    },
    onError: (error: Error) => {
      showError('Failed to approve load', extractErrorMessage(error));
    },
  });
}

export function useSendBack() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, reason }: { loadId: string; reason: string }) => closeOutApi.sendBack(loadId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      qc.invalidateQueries({ queryKey: ['loads'] });
      showSuccess('Load sent back for review');
    },
    onError: (error: Error) => {
      showError('Failed to send back', extractErrorMessage(error));
    },
  });
}

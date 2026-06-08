import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { ediApi } from '../api';
import type { TenderResponseDto } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function usePendingTenders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.edi.tenders,
    queryFn: ediApi.listPendingTenders,
    refetchInterval: 30_000,
    enabled: options?.enabled !== false,
  });
}

export function useRespondToTender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loadId, data }: { loadId: number; data: TenderResponseDto }) => ediApi.respondToTender(loadId, data),
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.edi.tenders });
      queryClient.invalidateQueries({ queryKey: ['loads'] });
      const action = data.response === 'accept' ? 'accepted' : data.response === 'decline' ? 'declined' : 'countered';
      showSuccess(`Tender ${action}`);
    },
    onError: (err: Error) => showError('Failed to respond to tender', extractErrorMessage(err)),
  });
}

export function useAutoAcceptRules() {
  return useQuery({
    queryKey: queryKeys.edi.rules,
    queryFn: ediApi.listRules,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ediApi.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.edi.rules });
      showSuccess('Auto-accept rule created');
    },
    onError: (err: Error) => showError('Failed to create rule', extractErrorMessage(err)),
  });
}

export function useApproveRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: number) => ediApi.approveRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.edi.rules });
      showSuccess('Rule approved');
    },
    onError: (err: Error) => showError('Failed to approve rule', extractErrorMessage(err)),
  });
}

export function useTradingPartners() {
  return useQuery({
    queryKey: queryKeys.edi.partners,
    queryFn: ediApi.listPartners,
  });
}

export function useEDIMessages(params?: Record<string, string>) {
  return useQuery({
    queryKey: [...queryKeys.edi.messages, params],
    queryFn: () => ediApi.listMessages(params),
  });
}

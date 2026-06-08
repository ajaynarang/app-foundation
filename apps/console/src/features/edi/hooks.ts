import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import * as ediApi from './api';
import type { ListMessagesParams } from './api';

export const EDI_KEYS = {
  partners: () => ['edi', 'partners'] as const,
  rules: () => ['edi', 'rules'] as const,
  messages: (filters: ListMessagesParams) => ['edi', 'messages', filters] as const,
};

// ---------- Partners ----------

export function useEdiPartners() {
  return useQuery({
    queryKey: EDI_KEYS.partners(),
    queryFn: ediApi.listPartners,
  });
}

export function useTogglePartnerStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, isActive }: { partnerId: string; isActive: boolean }) =>
      ediApi.togglePartnerStatus(partnerId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EDI_KEYS.partners() });
      showSuccess('Partner status updated');
    },
    onError: (error: Error) => {
      showError('Failed to update partner status', error.message);
    },
  });
}

// ---------- Rules ----------

export function useEdiRules() {
  return useQuery({
    queryKey: EDI_KEYS.rules(),
    queryFn: ediApi.listRules,
  });
}

export function useToggleRuleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) =>
      ediApi.toggleRuleStatus(ruleId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EDI_KEYS.rules() });
      showSuccess('Rule status updated');
    },
    onError: (error: Error) => {
      showError('Failed to update rule status', error.message);
    },
  });
}

export function useApproveRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => ediApi.approveRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EDI_KEYS.rules() });
      showSuccess('Rule approved and activated');
    },
    onError: (error: Error) => {
      showError('Failed to approve rule', error.message);
    },
  });
}

export function useDismissRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => ediApi.dismissRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EDI_KEYS.rules() });
      showSuccess('Rule dismissed');
    },
    onError: (error: Error) => {
      showError('Failed to dismiss rule', error.message);
    },
  });
}

// ---------- Messages ----------

export function useEdiMessages(params: ListMessagesParams) {
  return useQuery({
    queryKey: EDI_KEYS.messages(params),
    queryFn: () => ediApi.listMessages(params),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

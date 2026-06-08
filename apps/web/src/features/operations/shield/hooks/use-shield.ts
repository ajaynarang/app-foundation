import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { shieldApi } from '../api';
import { queryKeys } from '@/shared/constants';
import type { TriggerAuditParams } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useShieldLatest() {
  return useQuery({
    queryKey: queryKeys.shield.latest,
    queryFn: () => shieldApi.getLatest(),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.inProgress ? 3000 : false;
    },
  });
}

export function useShieldScores() {
  return useQuery({
    queryKey: queryKeys.shield.scores,
    queryFn: () => shieldApi.getScores(),
  });
}

export function useTriggerAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: TriggerAuditParams) => shieldApi.triggerAudit(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shield.root });
    },
    onError: (error: Error) => {
      showError('Failed to trigger audit', extractErrorMessage(error));
    },
  });
}

export function useCancelAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (auditId: string) => shieldApi.cancelAudit(auditId),
    onSuccess: () => {
      showSuccess('Audit cancelled');
      queryClient.invalidateQueries({ queryKey: queryKeys.shield.root });
    },
    onError: (error: Error) => {
      showError('Failed to cancel audit', extractErrorMessage(error));
    },
  });
}

export function useShieldAuditHistory(limit = 20, offset = 0, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: queryKeys.shield.history(limit, offset, dateFrom, dateTo),
    queryFn: () => shieldApi.getAuditHistory(limit, offset, dateFrom, dateTo),
  });
}

export function useShieldAuditById(auditId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.shield.audit(auditId!),
    queryFn: () => shieldApi.getAuditById(auditId!),
    enabled: !!auditId,
  });
}

export function useShieldFindings(filters?: { category?: string; severity?: string; resolved?: boolean }) {
  return useQuery({
    queryKey: queryKeys.shield.findings(filters as Record<string, unknown>),
    queryFn: () => shieldApi.getFindings(filters),
  });
}

export function useResolveFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => shieldApi.resolveFinding(findingId),
    onSuccess: () => {
      showSuccess('Finding resolved');
      queryClient.invalidateQueries({ queryKey: queryKeys.shield.root });
    },
    onError: (error: Error) => {
      showError('Failed to resolve finding', extractErrorMessage(error));
    },
  });
}

export function useBulkResolveFindings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (findingIds: string[]) => shieldApi.bulkResolveFindings(findingIds),
    onSuccess: () => {
      showSuccess('Findings resolved');
      queryClient.invalidateQueries({ queryKey: queryKeys.shield.root });
    },
    onError: (error: Error) => {
      showError('Failed to resolve findings', extractErrorMessage(error));
    },
  });
}

export function useShieldCustomRules() {
  return useQuery({
    queryKey: queryKeys.shield.rules,
    queryFn: () => shieldApi.getCustomRules(),
  });
}

export function useCreateCustomRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule: string) => shieldApi.createCustomRule(rule),
    onSuccess: () => {
      showSuccess('Custom rule created');
      queryClient.invalidateQueries({
        queryKey: queryKeys.shield.rules,
      });
    },
    onError: (error: Error) => {
      showError('Failed to create custom rule', extractErrorMessage(error));
    },
  });
}

export function useUpdateCustomRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: { rule?: string; isActive?: boolean } }) =>
      shieldApi.updateCustomRule(ruleId, data),
    onSuccess: () => {
      showSuccess('Custom rule updated');
      queryClient.invalidateQueries({
        queryKey: queryKeys.shield.rules,
      });
    },
    onError: (error: Error) => {
      showError('Failed to update custom rule', extractErrorMessage(error));
    },
  });
}

export function useDeleteCustomRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => shieldApi.deleteCustomRule(ruleId),
    onSuccess: () => {
      showSuccess('Custom rule deleted');
      queryClient.invalidateQueries({
        queryKey: queryKeys.shield.rules,
      });
    },
    onError: (error: Error) => {
      showError('Failed to delete custom rule', extractErrorMessage(error));
    },
  });
}

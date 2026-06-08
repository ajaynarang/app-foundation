import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { settlementsApi } from '../api';
import type { SettlementListParams } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// --- Query hooks ---

export function useSettlements(params?: SettlementListParams) {
  return useQuery({
    queryKey: [...queryKeys.settlements.root, params],
    queryFn: () => settlementsApi.list(params),
  });
}

export function useSettlementSummary(params?: { periodStart?: string; periodEnd?: string }) {
  return useQuery({
    queryKey: [...queryKeys.settlements.root, 'summary', params],
    queryFn: () => settlementsApi.getSummary(params),
  });
}

export function usePreviewBatch(data: { periodStart: string; periodEnd: string }, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.settlements.root, 'preview-batch', data],
    queryFn: () => settlementsApi.previewBatch(data),
    enabled,
  });
}

// --- Single mutation hooks ---

export function useApproveSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) => settlementsApi.approve(settlementId),
    onMutate: async (settlementId) => {
      await qc.cancelQueries({ queryKey: queryKeys.settlements.root });
      const prev = qc.getQueriesData({ queryKey: queryKeys.settlements.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueriesData({ queryKey: queryKeys.settlements.root }, (old: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        old?.map((s: any) => (s.settlementId === settlementId ? { ...s, status: 'APPROVED' as const } : s)),
      );
      return { prev };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess('Settlement approved');
    },
    onError: (error: Error, _v, ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx?.prev?.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
      showError('Failed to approve settlement', extractErrorMessage(error));
    },
  });
}

export function useMarkSettlementPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) => settlementsApi.markPaid(settlementId),
    onMutate: async (settlementId) => {
      await qc.cancelQueries({ queryKey: queryKeys.settlements.root });
      const prev = qc.getQueriesData({ queryKey: queryKeys.settlements.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueriesData({ queryKey: queryKeys.settlements.root }, (old: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        old?.map((s: any) => (s.settlementId === settlementId ? { ...s, status: 'PAID' as const } : s)),
      );
      return { prev };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess('Settlement marked as paid');
    },
    onError: (error: Error, _v, ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx?.prev?.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
      showError('Failed to mark settlement as paid', extractErrorMessage(error));
    },
  });
}

export function useVoidSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) => settlementsApi.void(settlementId),
    onMutate: async (settlementId) => {
      await qc.cancelQueries({ queryKey: queryKeys.settlements.root });
      const prev = qc.getQueriesData({ queryKey: queryKeys.settlements.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueriesData({ queryKey: queryKeys.settlements.root }, (old: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        old?.map((s: any) => (s.settlementId === settlementId ? { ...s, status: 'VOID' as const } : s)),
      );
      return { prev };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess('Settlement voided');
    },
    onError: (error: Error, _v, ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx?.prev?.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
      showError('Failed to void settlement', extractErrorMessage(error));
    },
  });
}

export function useAddDeduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      settlementId,
      data,
    }: {
      settlementId: string;
      data: { type: string; description: string; amountCents: number };
    }) => settlementsApi.addDeduction(settlementId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess('Deduction added');
    },
    onError: (error: Error) => {
      showError('Failed to add deduction', extractErrorMessage(error));
    },
  });
}

export function useRemoveDeduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ settlementId, deductionId }: { settlementId: string; deductionId: number }) =>
      settlementsApi.removeDeduction(settlementId, deductionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess('Deduction removed');
    },
    onError: (error: Error) => {
      showError('Failed to remove deduction', extractErrorMessage(error));
    },
  });
}

export function useUpdateNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ settlementId, notes }: { settlementId: string; notes: string }) =>
      settlementsApi.updateNotes(settlementId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess('Notes updated');
    },
    onError: (error: Error) => {
      showError('Failed to update notes', extractErrorMessage(error));
    },
  });
}

// --- Batch mutation hooks ---

export function useBatchCalculate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { driverIds: string[]; periodStart: string; periodEnd: string }) =>
      settlementsApi.batchCalculate(data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess(`Calculated ${data.successCount} of ${data.total} settlements`);
    },
    onError: (error: Error) => {
      showError('Failed to calculate settlements', extractErrorMessage(error));
    },
  });
}

export function useBatchApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementIds: string[]) => settlementsApi.batchApprove(settlementIds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess(`Approved ${data.approved} settlement${(data.approved ?? 0) !== 1 ? 's' : ''}`);
    },
    onError: (error: Error) => {
      showError('Failed to approve settlements', extractErrorMessage(error));
    },
  });
}

export function useBatchPay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementIds: string[]) => settlementsApi.batchPay(settlementIds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess(`Marked ${data.paid} settlement${(data.paid ?? 0) !== 1 ? 's' : ''} as paid`);
    },
    onError: (error: Error) => {
      showError('Failed to mark settlements as paid', extractErrorMessage(error));
    },
  });
}

export function useBatchVoid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementIds: string[]) => settlementsApi.batchVoid(settlementIds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess(`Voided ${data.voided} settlement${(data.voided ?? 0) !== 1 ? 's' : ''}`);
    },
    onError: (error: Error) => {
      showError('Failed to void settlements', extractErrorMessage(error));
    },
  });
}

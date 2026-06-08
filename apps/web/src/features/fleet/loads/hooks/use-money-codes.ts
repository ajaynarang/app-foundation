import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants';
import { moneyCodesApi } from '../api/money-codes';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useMoneyCodesByLoad(loadId: string) {
  return useQuery({
    queryKey: queryKeys.moneyCodes.byLoad(loadId),
    queryFn: () => moneyCodesApi.list(loadId),
    enabled: !!loadId,
  });
}

export function useCreateMoneyCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loadId,
      ...data
    }: {
      loadId: string;
      requestedCents: number;
      method: string;
      stopId?: number;
      driverNote?: string;
    }) => moneyCodesApi.create(loadId, data),
    onSuccess: (_, { loadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.moneyCodes.byLoad(loadId) });
      showSuccess('Lumper request sent');
    },
    onError: (e: Error) => showError('Failed to send request', extractErrorMessage(e)),
  });
}

export function useApproveMoneyCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loadId,
      moneyCodeId,
      ...data
    }: {
      loadId: string;
      moneyCodeId: string;
      code: string;
      amountCents: number;
      dispatcherNote?: string;
    }) => moneyCodesApi.approve(loadId, moneyCodeId, data),
    onSuccess: (_, { loadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.moneyCodes.byLoad(loadId) });
      qc.invalidateQueries({ queryKey: queryKeys.alerts.root });
      showSuccess('Money code approved and sent to driver');
    },
    onError: (e: Error) => showError('Failed to approve', extractErrorMessage(e)),
  });
}

export function useDenyMoneyCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loadId, moneyCodeId, ...data }: { loadId: string; moneyCodeId: string; dispatcherNote?: string }) =>
      moneyCodesApi.deny(loadId, moneyCodeId, data),
    onSuccess: (_, { loadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.moneyCodes.byLoad(loadId) });
      qc.invalidateQueries({ queryKey: queryKeys.alerts.root });
      showSuccess('Request denied');
    },
    onError: (e: Error) => showError('Failed to deny', extractErrorMessage(e)),
  });
}

export function useMarkMoneyCodeUsed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loadId,
      moneyCodeId,
      ...data
    }: {
      loadId: string;
      moneyCodeId: string;
      actualAmountCents: number;
      receiptDocumentId?: number;
    }) => moneyCodesApi.markUsed(loadId, moneyCodeId, data),
    onSuccess: (_, { loadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.moneyCodes.byLoad(loadId) });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Receipt submitted — charge created');
    },
    onError: (e: Error) => showError('Failed to submit receipt', extractErrorMessage(e)),
  });
}

export function useCancelMoneyCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loadId, moneyCodeId }: { loadId: string; moneyCodeId: string }) =>
      moneyCodesApi.cancel(loadId, moneyCodeId),
    onSuccess: (_, { loadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.moneyCodes.byLoad(loadId) });
      showSuccess('Request cancelled');
    },
    onError: (e: Error) => showError('Failed to cancel', extractErrorMessage(e)),
  });
}

export function useLumperInsights(loadId: string) {
  return useQuery({
    queryKey: queryKeys.moneyCodes.insights(loadId),
    queryFn: () => moneyCodesApi.insights(loadId),
    enabled: !!loadId,
  });
}

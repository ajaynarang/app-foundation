'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { invoicesApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import type { RecordFactoringTransactionInput } from '@sally/shared-types';

export function useFactoringTransactions(invoiceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.factoring.byInvoice(invoiceId),
    queryFn: () => invoicesApi.listFactoringTransactions(invoiceId),
    enabled: enabled && !!invoiceId,
  });
}

export function useFactoringSummary(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: queryKeys.factoring.summary(params),
    queryFn: () => invoicesApi.factoringSummary(params),
  });
}

export function useBackfillStatus() {
  return useQuery({
    queryKey: ['factoring', 'backfill-status'] as const,
    queryFn: () => invoicesApi.factoringBackfillStatus(),
  });
}

const SUCCESS_MESSAGE: Record<RecordFactoringTransactionInput['type'], string> = {
  ADVANCE: 'Advance recorded',
  FEE: 'Fee recorded',
  RESERVE_RELEASE: 'Reserve release recorded — invoice marked PAID',
  CHARGEBACK: 'Chargeback recorded — invoice marked RECOURSED',
  CHARGEBACK_REVERSAL: 'Chargeback reversal recorded',
};

export function useRecordFactoringTransaction(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordFactoringTransactionInput) => invoicesApi.recordFactoringTransaction(invoiceId, body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: queryKeys.factoring.byInvoice(invoiceId) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      qc.invalidateQueries({ queryKey: queryKeys.factoring.root });
      showSuccess(SUCCESS_MESSAGE[body.type]);
    },
    onError: (error: Error) => {
      showError('Failed to record transaction', extractErrorMessage(error));
    },
  });
}

export function useDeleteFactoringTransaction(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: string) => invoicesApi.deleteFactoringTransaction(transactionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.factoring.byInvoice(invoiceId) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Transaction deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete transaction', extractErrorMessage(error));
    },
  });
}

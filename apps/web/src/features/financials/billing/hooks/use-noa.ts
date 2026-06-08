'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { invoicesApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export interface NoaInboxFilters {
  status?: string;
  factorId?: number;
  customerId?: number;
  ageBucket?: 'all' | 'pending_gt_14' | 'rejected';
  limit?: number;
  offset?: number;
}

export function useNoaRecords(customerId?: number) {
  return useQuery({
    queryKey: customerId ? queryKeys.noaRecords.byCustomer(customerId) : queryKeys.noaRecords.root,
    queryFn: () => invoicesApi.listNoaRecords(customerId ? { customerId } : undefined),
    enabled: customerId !== undefined ? !!customerId : true,
  });
}

export function useCreateNoaRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { customerId: number; factoringCompanyId: number; notes?: string }) =>
      invoicesApi.createNoaRecord(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
      showSuccess('NOA record created');
    },
    onError: (error: Error) => {
      showError('Failed to create NOA record', extractErrorMessage(error));
    },
  });
}

export function useUpdateNoaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noaId, data }: { noaId: string; data: { status: string; rejectionReason?: string } }) =>
      invoicesApi.updateNoaStatus(noaId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
      showSuccess('NOA status updated');
    },
    onError: (error: Error) => {
      showError('Failed to update NOA status', extractErrorMessage(error));
    },
  });
}

export function useDeleteNoaRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noaId: string) => invoicesApi.deleteNoaRecord(noaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
      showSuccess('NOA record deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete NOA record', extractErrorMessage(error));
    },
  });
}

/**
 * Paginated NOA inbox. Filters are normalized into the query key so
 * `?status=&factorId=` and `?status=NOT_SENT` get distinct cache slots.
 */
export function useNoaInbox(filters?: NoaInboxFilters, opts?: { enabled?: boolean }) {
  const normalized = filters
    ? Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''))
    : undefined;
  return useQuery({
    queryKey: queryKeys.noaRecords.inbox(normalized as Record<string, unknown> | undefined),
    queryFn: () => invoicesApi.listNoaInbox(filters),
    enabled: opts?.enabled ?? true,
  });
}

/**
 * Sends the NOA letter via the backend (Resend + pdfmake). Invalidates
 * every NOA cache so inline status pills, the inbox, and the customer
 * detail section all refresh in place.
 */
export function useSendNoa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noaId: string) => invoicesApi.sendNoaEmail(noaId),
    onSuccess: (result) => {
      showSuccess(`NOA sent to ${result.to}`);
      qc.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
    },
    onError: (error: Error) => showError('Could not send NOA', extractErrorMessage(error)),
  });
}

/**
 * Bulk-create NOAs after a tenant factor change. Idempotent — the backend
 * subscriber to TENANT_FACTORING_DEFAULT_CHANGED has already run, so this
 * is the dispatcher-initiated re-trigger surfaced from the post-pin toast.
 */
export function useBulkCreateNoaForFactorChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (newFactoringCompanyId: number) => invoicesApi.bulkCreateNoaForFactorChange(newFactoringCompanyId),
    onSuccess: (result) => {
      const summary =
        result.created === 0 && result.skipped > 0
          ? `${result.skipped} broker${result.skipped === 1 ? '' : 's'} already had a NOA on file`
          : `Generated ${result.created} new NOA${result.created === 1 ? '' : 's'}`;
      showSuccess(summary);
      qc.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
    },
    onError: (error: Error) => showError('Could not generate NOAs', extractErrorMessage(error)),
  });
}

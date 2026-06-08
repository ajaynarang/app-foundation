'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError, showSuccessWithLink } from '@sally/ui';
import { accountingApi } from './api';
import { getOAuthConnectUrl, disconnectOAuth } from '@/features/integrations';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useAccountingStatus() {
  return useQuery({
    queryKey: [...queryKeys.accounting.root, 'status'],
    queryFn: () => accountingApi.getStatus(),
    staleTime: 60_000,
  });
}

export function useAccountingConnect() {
  return useMutation({
    mutationFn: () => getOAuthConnectUrl('QUICKBOOKS'),
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: (error: Error) => {
      showError('Failed to connect QuickBooks', extractErrorMessage(error));
    },
  });
}

export function useAccountingDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectOAuth('QUICKBOOKS'),
    onSuccess: () => {
      showSuccess('QuickBooks disconnected');
      qc.invalidateQueries({ queryKey: queryKeys.accounting.root });
    },
    onError: (error: Error) => {
      showError('Failed to disconnect QuickBooks', extractErrorMessage(error));
    },
  });
}

export function useSyncInvoiceToAccounting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => accountingApi.syncInvoice(invoiceId),
    onSuccess: (data) => {
      showSuccessWithLink(
        'Invoice sync queued',
        'View in System Activity',
        '/settings/system-activity?category=accounting',
        data.jobId,
      );
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
    },
    onError: (error: Error) => {
      showError('Failed to sync invoice', extractErrorMessage(error));
    },
  });
}

export function useSyncSettlementToAccounting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) => accountingApi.syncSettlement(settlementId),
    onSuccess: (data) => {
      showSuccessWithLink(
        'Settlement sync queued',
        'View in System Activity',
        '/settings/system-activity?category=accounting',
        data.jobId,
      );
      qc.invalidateQueries({ queryKey: queryKeys.settlements.root });
    },
    onError: (error: Error) => {
      showError('Failed to sync settlement', extractErrorMessage(error));
    },
  });
}

export function useEntityMappings(entityType: 'customer' | 'vendor' | 'class') {
  return useQuery({
    queryKey: [...queryKeys.accounting.root, 'mappings', entityType],
    queryFn: () => accountingApi.getEntityMappings(entityType),
    staleTime: 0,
  });
}

export function useExternalEntities(entityType: 'customer' | 'vendor' | 'class') {
  return useQuery({
    queryKey: [...queryKeys.accounting.root, 'external-entities', entityType],
    queryFn: () => accountingApi.getExternalEntities(entityType),
    staleTime: 5 * 60_000, // 5 min — external entities only change on sync
  });
}

export function useUpdateEntityMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mappingId, data }: { mappingId: number; data: { externalId: string; externalName: string } }) =>
      accountingApi.updateEntityMapping(mappingId, data),
    onSuccess: () => {
      showSuccess('Mapping updated');
      qc.invalidateQueries({ queryKey: [...queryKeys.accounting.root, 'mappings'] });
    },
    onError: (error: Error) => {
      showError('Failed to update mapping', extractErrorMessage(error));
    },
  });
}

export function useConfirmEntityMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: number) => accountingApi.confirmEntityMapping(mappingId),
    onSuccess: () => {
      showSuccess('Mapping confirmed');
      qc.invalidateQueries({ queryKey: [...queryKeys.accounting.root, 'mappings'] });
    },
    onError: (error: Error) => {
      showError('Failed to confirm mapping', extractErrorMessage(error));
    },
  });
}

export function useAccountMappings() {
  return useQuery({
    queryKey: [...queryKeys.accounting.root, 'account-mappings'],
    queryFn: () => accountingApi.getAccountMappings(),
    staleTime: 0,
  });
}

export function useInitialSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => accountingApi.triggerInitialSync(),
    onSuccess: (data) => {
      showSuccessWithLink(
        'Entity sync started — mappings will update shortly',
        'View in System Activity',
        '/settings/system-activity?category=accounting',
        data.jobId,
      );
      qc.invalidateQueries({ queryKey: [...queryKeys.accounting.root, 'mappings'], exact: false });
      qc.invalidateQueries({ queryKey: [...queryKeys.accounting.root, 'status'] });
    },
    onError: (error: Error) => {
      showError('Sync failed', extractErrorMessage(error));
    },
  });
}

export function useUpdateAccountMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      mappingId,
      data,
    }: {
      mappingId: number;
      data: { externalAccountId?: string; externalAccountName?: string };
    }) => accountingApi.updateAccountMapping(mappingId, data),
    onSuccess: () => {
      showSuccess('Account mapping updated');
      qc.invalidateQueries({ queryKey: [...queryKeys.accounting.root, 'account-mappings'] });
    },
    onError: (error: Error) => {
      showError('Failed to update account mapping', extractErrorMessage(error));
    },
  });
}

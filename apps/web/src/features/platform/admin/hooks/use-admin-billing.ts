'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { adminBillingApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useAdminTenantBilling(tenantId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
    queryFn: () => adminBillingApi.getTenantBilling(tenantId!),
    enabled: !!tenantId,
  });
}

export function useAdminCreateSubscription(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { plan: string; quantity: number; customPriceCents?: number }) =>
      adminBillingApi.createSubscription(tenantId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenantPlan });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenants });
      showSuccess('Subscription created');
    },
    onError: (error: Error) => {
      showError('Failed to create subscription', extractErrorMessage(error));
    },
  });
}

export function useAdminAddCredit(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { amountCents: number; reason: string }) => adminBillingApi.addCredit(tenantId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      showSuccess('Credit added');
    },
    onError: (error: Error) => {
      showError('Failed to add credit', extractErrorMessage(error));
    },
  });
}

export function useAdminOverridePrice(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (unitPriceCents: number) => adminBillingApi.overridePrice(tenantId!, unitPriceCents),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      showSuccess('Price updated');
    },
    onError: (error: Error) => {
      showError('Failed to update price', extractErrorMessage(error));
    },
  });
}

export function useAdminChangeSubscriptionPlan(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { plan: string; quantity?: number }) => adminBillingApi.changeSubscriptionPlan(tenantId!, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenantPlan });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenants });
      const actionLabels = {
        upgraded: 'Subscription upgraded',
        downgraded: 'Subscription downgraded',
        created: 'Subscription created',
      };
      showSuccess(actionLabels[result.action]);
    },
    onError: (error: Error) => {
      showError('Failed to change subscription plan', extractErrorMessage(error));
    },
  });
}

export function useAdminCancelImmediately(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminBillingApi.cancelImmediately(tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenantPlan });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenants });
      showSuccess('Subscription canceled immediately');
    },
    onError: (error: Error) => {
      showError('Failed to cancel subscription', extractErrorMessage(error));
    },
  });
}

export function useAdminPauseBilling(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminBillingApi.pauseBilling(tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      showSuccess('Billing paused');
    },
    onError: (error: Error) => {
      showError('Failed to pause billing', extractErrorMessage(error));
    },
  });
}

export function useAdminResumeBilling(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminBillingApi.resumeBilling(tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      showSuccess('Billing resumed');
    },
    onError: (error: Error) => {
      showError('Failed to resume billing', extractErrorMessage(error));
    },
  });
}

export function useAdminExtendTrial(tenantId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => adminBillingApi.extendTrial(tenantId!, days),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantId)),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenantPlan });
      showSuccess('Trial extended');
    },
    onError: (error: Error) => {
      showError('Failed to extend trial', extractErrorMessage(error));
    },
  });
}

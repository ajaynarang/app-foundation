'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@app/ui';
import { queryKeys } from '@appshore/web-core/shared/constants';
import { billingApi } from '../api';
import type {
  TopUpRequest,
  AutoReloadSettings,
  CreateCheckoutSessionRequest,
  UpgradePlanRequest,
  DowngradePlanRequest,
  UpdateQuantityRequest,
  CancelSubscriptionRequest,
} from '../types';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useBillingOverview() {
  return useQuery({
    queryKey: [...queryKeys.billing.root, 'overview'],
    queryFn: () => billingApi.getOverview(),
  });
}

export function useWalletBalance() {
  return useQuery({
    queryKey: queryKeys.billing.wallet,
    queryFn: () => billingApi.getWalletBalance(),
  });
}

export function useBillingInvoices(params?: { status?: string; cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: [...queryKeys.billing.invoices, params],
    queryFn: () => billingApi.listInvoices(params),
  });
}

export function useUpcomingInvoice() {
  return useQuery({
    queryKey: [...queryKeys.billing.invoices, 'upcoming'],
    queryFn: () => billingApi.getUpcomingInvoice(),
  });
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: queryKeys.billing.paymentMethods,
    queryFn: () => billingApi.listPaymentMethods(),
  });
}

export function useWalletTransactions(params?: { type?: string; cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: [...queryKeys.billing.transactions, params],
    queryFn: () => billingApi.getTransactions(params),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (data: CreateCheckoutSessionRequest) => billingApi.createCheckoutSession(data),
    onSuccess: (result) => {
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    },
    onError: (error: Error) => {
      showError('Failed to start checkout', extractErrorMessage(error));
    },
  });
}

export function useUpgradePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpgradePlanRequest) => billingApi.upgradePlan(data),
    onSuccess: () => {
      showSuccess('Plan upgraded successfully');
      qc.invalidateQueries({ queryKey: queryKeys.billing.root });
      qc.invalidateQueries({ queryKey: queryKeys.plans.root });
    },
    onError: (error: Error) => {
      showError('Failed to upgrade plan', extractErrorMessage(error));
    },
  });
}

export function useDowngradePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DowngradePlanRequest) => billingApi.downgradePlan(data),
    onSuccess: () => {
      showSuccess('Plan will downgrade at the end of your billing period');
      qc.invalidateQueries({ queryKey: queryKeys.billing.root });
      qc.invalidateQueries({ queryKey: queryKeys.plans.root });
    },
    onError: (error: Error) => {
      showError('Failed to downgrade plan', extractErrorMessage(error));
    },
  });
}

export function useUpdateQuantity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateQuantityRequest) => billingApi.updateQuantity(data),
    onSuccess: () => {
      showSuccess('Seat count updated');
      qc.invalidateQueries({ queryKey: queryKeys.billing.root });
      qc.invalidateQueries({ queryKey: queryKeys.plans.root });
    },
    onError: (error: Error) => {
      showError('Failed to update seat count', extractErrorMessage(error));
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data?: CancelSubscriptionRequest) => billingApi.cancelSubscription(data),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.billing.root });
      const previous = qc.getQueryData([...queryKeys.billing.root, 'overview']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueryData([...queryKeys.billing.root, 'overview'], (old: any) => {
        if (!old?.subscription) return old;
        return {
          ...old,
          subscription: { ...old.subscription, cancelAtPeriodEnd: true },
        };
      });
      return { previous };
    },
    onSuccess: () => {
      showSuccess('Subscription will cancel at the end of your billing period');
      qc.invalidateQueries({ queryKey: queryKeys.billing.root });
      qc.invalidateQueries({ queryKey: queryKeys.plans.root });
    },
    onError: (error: Error, _data, context) => {
      if (context?.previous) {
        qc.setQueryData([...queryKeys.billing.root, 'overview'], context.previous);
      }
      showError('Failed to cancel subscription', extractErrorMessage(error));
    },
  });
}

export function useReactivateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => billingApi.reactivateSubscription(),
    onSuccess: () => {
      showSuccess('Subscription reactivated');
      qc.invalidateQueries({ queryKey: queryKeys.billing.root });
      qc.invalidateQueries({ queryKey: queryKeys.plans.root });
    },
    onError: (error: Error) => {
      showError('Failed to reactivate subscription', extractErrorMessage(error));
    },
  });
}

export function useTopUpWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TopUpRequest) => billingApi.topUp(data),
    onSuccess: () => {
      showSuccess('Wallet topped up successfully');
      qc.invalidateQueries({ queryKey: queryKeys.billing.wallet });
    },
    onError: (error: Error) => {
      showError('Failed to top up wallet', extractErrorMessage(error));
    },
  });
}

export function useUpdateAutoReload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AutoReloadSettings) => billingApi.updateAutoReload(data),
    onSuccess: () => {
      showSuccess('Auto-reload settings updated');
      qc.invalidateQueries({ queryKey: queryKeys.billing.wallet });
    },
    onError: (error: Error) => {
      showError('Failed to update auto-reload settings', extractErrorMessage(error));
    },
  });
}

export function useSetDefaultPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingApi.setDefaultPaymentMethod(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.billing.paymentMethods });
      const previous = qc.getQueryData(queryKeys.billing.paymentMethods);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueryData(queryKeys.billing.paymentMethods, (old: any) => {
        if (!Array.isArray(old)) return old;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return old.map((pm: any) => ({
          ...pm,
          isDefault: pm.id === id,
        }));
      });
      return { previous };
    },
    onSuccess: () => {
      showSuccess('Default payment method updated');
    },
    onError: (error: Error, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.billing.paymentMethods, context.previous);
      }
      showError('Failed to set default payment method', extractErrorMessage(error));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.billing.paymentMethods });
    },
  });
}

export function useRemovePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingApi.removePaymentMethod(id),
    onSuccess: () => {
      showSuccess('Payment method removed');
      qc.invalidateQueries({ queryKey: queryKeys.billing.paymentMethods });
    },
    onError: (error: Error) => {
      showError('Failed to remove payment method', extractErrorMessage(error));
    },
  });
}

export function useSetupPaymentMethod() {
  return useMutation({
    mutationFn: (data: { returnUrl: string }) => billingApi.setupPaymentMethod(data),
    onSuccess: (result) => {
      if (result.setupUrl) {
        window.location.href = result.setupUrl;
      }
    },
    onError: (error: Error) => {
      showError('Failed to set up payment method', extractErrorMessage(error));
    },
  });
}

export function useDownloadBillingInvoice() {
  return useMutation({
    mutationFn: (invoiceId: string) => billingApi.downloadInvoice(invoiceId),
    onSuccess: (result) => {
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      } else if (result.hostedUrl) {
        window.open(result.hostedUrl, '_blank');
      }
      showSuccess('Invoice downloaded');
    },
    onError: (error: Error) => {
      showError('Failed to download invoice', extractErrorMessage(error));
    },
  });
}

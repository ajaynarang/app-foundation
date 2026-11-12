import { apiClient } from '@appshore/web-core/shared/lib/api';
import type {
  BillingOverview,
  BillingInvoice,
  PaymentMethod,
  WalletTransaction,
  WalletBalanceResponse,
  CreateCheckoutSessionRequest,
  UpgradePlanRequest,
  DowngradePlanRequest,
  UpdateQuantityRequest,
  CancelSubscriptionRequest,
  TopUpRequest,
  AutoReloadSettings,
} from './types';
import type { CursorList } from '@app/shared-types';

export const billingApi = {
  // ---------------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------------
  getOverview: async (): Promise<BillingOverview> => apiClient<BillingOverview>('/billing/overview'),

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------
  createCheckoutSession: async (data: CreateCheckoutSessionRequest): Promise<{ checkoutUrl: string }> =>
    apiClient('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  upgradePlan: async (data: UpgradePlanRequest): Promise<BillingOverview> =>
    apiClient<BillingOverview>('/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  downgradePlan: async (data: DowngradePlanRequest): Promise<BillingOverview> =>
    apiClient<BillingOverview>('/billing/downgrade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateQuantity: async (data: UpdateQuantityRequest): Promise<BillingOverview> =>
    apiClient<BillingOverview>('/billing/quantity', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancelSubscription: async (data?: CancelSubscriptionRequest): Promise<BillingOverview> =>
    apiClient<BillingOverview>('/billing/cancel', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  reactivateSubscription: async (): Promise<BillingOverview> =>
    apiClient<BillingOverview>('/billing/reactivate', { method: 'POST' }),

  // ---------------------------------------------------------------------------
  // Wallet
  // ---------------------------------------------------------------------------
  getWalletBalance: async (): Promise<WalletBalanceResponse> => apiClient<WalletBalanceResponse>('/billing/wallet'),

  topUp: async (data: TopUpRequest): Promise<WalletBalanceResponse> =>
    apiClient<WalletBalanceResponse>('/billing/wallet/top-up', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAutoReload: async (data: AutoReloadSettings): Promise<WalletBalanceResponse> =>
    apiClient<WalletBalanceResponse>('/billing/wallet/auto-reload', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getTransactions: async (params?: {
    type?: string;
    cursor?: string;
    limit?: number;
  }): Promise<CursorList<WalletTransaction>> => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return apiClient<CursorList<WalletTransaction>>(`/billing/wallet/transactions${qs ? `?${qs}` : ''}`);
  },

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------
  listInvoices: async (params?: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<CursorList<BillingInvoice>> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return apiClient<CursorList<BillingInvoice>>(`/billing/invoices${qs ? `?${qs}` : ''}`);
  },

  getUpcomingInvoice: async (): Promise<BillingInvoice> => apiClient<BillingInvoice>('/billing/invoices/upcoming'),

  downloadInvoice: async (invoiceId: string): Promise<{ pdfUrl: string; hostedUrl: string }> =>
    apiClient(`/billing/invoices/${invoiceId}/download`),

  // ---------------------------------------------------------------------------
  // Payment Methods
  // ---------------------------------------------------------------------------
  setupPaymentMethod: async (data: { returnUrl: string }): Promise<{ setupUrl: string }> =>
    apiClient('/billing/payment-methods/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listPaymentMethods: async (): Promise<PaymentMethod[]> => apiClient<PaymentMethod[]>('/billing/payment-methods'),

  setDefaultPaymentMethod: async (id: string): Promise<BillingOverview> =>
    apiClient<BillingOverview>(`/billing/payment-methods/${id}/default`, { method: 'PATCH' }),

  removePaymentMethod: async (id: string): Promise<void> =>
    apiClient<void>(`/billing/payment-methods/${id}`, { method: 'DELETE' }),
};

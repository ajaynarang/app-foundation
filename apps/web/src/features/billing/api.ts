import { apiClient } from '@appshore/web-core/shared/lib/api';
import type {
  BillingOverview,
  BillingSubscription,
  BillingInvoice,
  PaymentMethod,
  Wallet,
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

  upgradePlan: async (data: UpgradePlanRequest): Promise<BillingSubscription> =>
    apiClient<BillingSubscription>('/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  downgradePlan: async (data: DowngradePlanRequest): Promise<BillingSubscription> =>
    apiClient<BillingSubscription>('/billing/downgrade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateQuantity: async (data: UpdateQuantityRequest): Promise<BillingSubscription> =>
    apiClient<BillingSubscription>('/billing/quantity', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancelSubscription: async (data?: CancelSubscriptionRequest): Promise<void> =>
    apiClient('/billing/cancel', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  reactivateSubscription: async (): Promise<BillingSubscription> =>
    apiClient<BillingSubscription>('/billing/reactivate', { method: 'POST' }),

  // ---------------------------------------------------------------------------
  // Wallet
  // ---------------------------------------------------------------------------
  getWalletBalance: async (): Promise<WalletBalanceResponse> => apiClient<WalletBalanceResponse>('/billing/wallet'),

  topUp: async (data: TopUpRequest): Promise<WalletTransaction> =>
    apiClient<WalletTransaction>('/billing/wallet/top-up', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAutoReload: async (data: AutoReloadSettings): Promise<Wallet> =>
    apiClient<Wallet>('/billing/wallet/auto-reload', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getTransactions: async (params?: {
    type?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: WalletTransaction[]; nextCursor?: string; hasMore: boolean }> => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return apiClient<{ items: WalletTransaction[]; nextCursor?: string; hasMore: boolean }>(
      `/billing/wallet/transactions${qs ? `?${qs}` : ''}`,
    );
  },

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------
  listInvoices: async (params?: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: BillingInvoice[]; nextCursor?: string; hasMore: boolean }> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return apiClient<{ items: BillingInvoice[]; nextCursor?: string; hasMore: boolean }>(
      `/billing/invoices${qs ? `?${qs}` : ''}`,
    );
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

  setDefaultPaymentMethod: async (id: string): Promise<void> =>
    apiClient(`/billing/payment-methods/${id}/default`, { method: 'PATCH' }),

  removePaymentMethod: async (id: string): Promise<void> =>
    apiClient(`/billing/payment-methods/${id}`, { method: 'DELETE' }),
};

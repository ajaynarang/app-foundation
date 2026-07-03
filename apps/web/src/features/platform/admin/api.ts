import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { BillingSubscription, BillingInvoice, PaymentMethod, Wallet, WalletTransaction } from '@app/shared-types';

// ---------- Billing Admin Types ----------

export interface TenantBillingState {
  tenant: {
    tenantId: string;
    companyName: string;
    plan: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    planAssignedAt: string | null;
  };
  subscription: BillingSubscription | null;
  wallet: (Wallet & { transactions: WalletTransaction[] }) | null;
  paymentMethods: PaymentMethod[];
  recentInvoices: BillingInvoice[];
}

// ---------- Types ----------

// ---------- Admin Billing API ----------

export const adminBillingApi = {
  /** Get full billing state for a tenant */
  getTenantBilling(tenantId: number): Promise<TenantBillingState> {
    return apiClient<TenantBillingState>(`/admin/billing/tenants/${tenantId}`);
  },

  /** Create a subscription for a tenant (admin-provisioned, no checkout) */
  createSubscription(
    tenantId: number,
    data: { plan: string; quantity: number; customPriceCents?: number },
  ): Promise<{ providerSubscriptionId: string }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/subscription`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Add wallet credits as a gift */
  addCredit(tenantId: number, data: { amountCents: number; reason: string }): Promise<{ success: boolean }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/credit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Override unit price for custom pricing */
  overridePrice(tenantId: number, unitPriceCents: number): Promise<{ success: boolean }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/price`, {
      method: 'PATCH',
      body: JSON.stringify({ unitPriceCents }),
    });
  },

  /** Change subscription plan (upgrade/downgrade/create) */
  changeSubscriptionPlan(
    tenantId: number,
    data: { plan: string; quantity?: number },
  ): Promise<{ action: 'upgraded' | 'downgraded' | 'created' }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/change-plan`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Immediately cancel subscription (not at period end) */
  cancelImmediately(tenantId: number): Promise<{ success: boolean }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/cancel-immediately`, { method: 'POST' });
  },

  /** Pause billing (cancel at period end) */
  pauseBilling(tenantId: number): Promise<{ success: boolean }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/pause`, {
      method: 'POST',
    });
  },

  /** Resume paused billing */
  resumeBilling(tenantId: number): Promise<{ success: boolean }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/resume`, {
      method: 'POST',
    });
  },

  /** Extend trial by N days */
  extendTrial(tenantId: number, days: number): Promise<{ success: boolean }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/extend-trial`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
  },

  /** Issue a refund */
  issueRefund(
    tenantId: number,
    data: {
      paymentId: string;
      amountCents?: number;
      reason?: string;
      creditWallet?: boolean;
    },
  ): Promise<{ refundId: string }> {
    return apiClient(`/admin/billing/tenants/${tenantId}/refund`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

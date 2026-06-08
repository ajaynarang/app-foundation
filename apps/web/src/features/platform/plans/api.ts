import { apiClient } from '@/shared/lib/api';
import type { PlanConfig, TenantPlanDetails, AssignPlanRequest } from './types';

const BASE = '/plans';

export const plansApi = {
  /**
   * Get all available plan configurations (public, no auth required).
   */
  getPlans(): Promise<PlanConfig[]> {
    return apiClient<PlanConfig[]>(BASE);
  },

  /**
   * Get the current tenant's plan details.
   */
  getMyPlan(): Promise<TenantPlanDetails> {
    return apiClient<TenantPlanDetails>(`${BASE}/my-plan`);
  },

  /**
   * Get a specific tenant's plan details (SUPER_ADMIN / platform admin only).
   */
  getTenantPlan(tenantId: string): Promise<TenantPlanDetails> {
    return apiClient<TenantPlanDetails>(`${BASE}/tenant/${tenantId}`);
  },

  /**
   * Assign a plan to a tenant (SUPER_ADMIN only).
   */
  assignPlan(data: AssignPlanRequest): Promise<TenantPlanDetails> {
    const { tenantId, ...body } = data;
    return apiClient<TenantPlanDetails>(`${BASE}/tenant/${tenantId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  /**
   * Update providerPriceId on a plan config (SUPER_ADMIN only).
   */
  updatePlanProviderPrice(plan: string, providerPriceId: string | null): Promise<PlanConfig> {
    return apiClient<PlanConfig>(`${BASE}/${plan}/provider-price`, {
      method: 'PATCH',
      body: JSON.stringify({ providerPriceId }),
    });
  },

  /**
   * Update a plan config (SUPER_ADMIN only).
   */
  updatePlanConfig(plan: string, data: Record<string, unknown>): Promise<PlanConfig> {
    return apiClient<PlanConfig>(`${BASE}/${plan}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Toggle an individual entitlement for a plan (SUPER_ADMIN only).
   */
  toggleEntitlement(plan: string, feature: string, enabled: boolean): Promise<unknown> {
    return apiClient(`${BASE}/${plan}/entitlements/${feature}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },
};

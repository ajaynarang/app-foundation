import { apiClient } from '@appshore/web-core/shared/lib/api';

export const billingApi = {
  /**
   * Fetch all tenants across all statuses for billing aggregation.
   * Returns raw tenant list from the super-admin tenants endpoint.
   */
  getTenants: async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await apiClient<any>('/tenants');
    return data.tenants || data || [];
  },

  /**
   * Fetch all plan configurations with pricing info.
   */
  getPlans: async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await apiClient<any>('/plans');
    return data.plans || data || [];
  },
};

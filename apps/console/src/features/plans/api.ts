import { apiClient } from '../../lib/api-client';

export type { TenantPlan, TenantPlanDetails } from '@sally/shared-types';

import type { TenantPlanDetails } from '@sally/shared-types';

const BASE = '/plans';

export const plansApi = {
  getMyPlan(): Promise<TenantPlanDetails> {
    return apiClient<TenantPlanDetails>(`${BASE}/my-plan`);
  },
};

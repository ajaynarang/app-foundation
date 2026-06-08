import { apiClient } from '../../lib/api-client';

export type { TenantPlan, TenantPlanDetails } from '@app/shared-types';

import type { TenantPlanDetails } from '@app/shared-types';

const BASE = '/plans';

export const plansApi = {
  getMyPlan(): Promise<TenantPlanDetails> {
    return apiClient<TenantPlanDetails>(`${BASE}/my-plan`);
  },
};

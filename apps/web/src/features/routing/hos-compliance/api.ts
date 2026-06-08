import { apiClient } from '@/shared/lib/api';
import type { HOSValidationRequest, HOSValidationResponse } from './types';

export const hosComplianceApi = {
  /**
   * Validate HOS compliance for driver state
   */
  validate: async (data: HOSValidationRequest): Promise<HOSValidationResponse> => {
    return apiClient<HOSValidationResponse>('/hos/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Re-export legacy object for backwards compatibility during migration
export const hosRules = {
  check: hosComplianceApi.validate,
};

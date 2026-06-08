import { apiClient } from '@/shared/lib/api';
import type { OnboardingStatusResponse } from './types';

export const onboardingApi = {
  /**
   * Get onboarding status for current user
   */
  getStatus: async (): Promise<OnboardingStatusResponse> => {
    return apiClient<OnboardingStatusResponse>('/onboarding/status');
  },
};

// Re-export legacy function for backwards compatibility during migration
export const getOnboardingStatus = onboardingApi.getStatus;

import { apiClient } from '@/shared/lib/api';
import type { RestRecommendationRequest, RestRecommendationResponse } from './types';

export const optimizationApi = {
  /**
   * Get REST optimization recommendation
   */
  recommend: async (data: RestRecommendationRequest): Promise<RestRecommendationResponse> => {
    return apiClient<RestRecommendationResponse>('/rest/recommend', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Re-export legacy object for backwards compatibility during migration
export const optimization = {
  recommend: optimizationApi.recommend,
};

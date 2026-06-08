import { apiClient } from '@/shared/lib/api';
import type { FeatureFlag, FeatureFlagsResponse, FeatureFlagEnabledResponse } from './types';

export const featureFlagsApi = {
  /**
   * Fetch all feature flags
   */
  list: async (): Promise<FeatureFlag[]> => {
    const data = await apiClient<FeatureFlagsResponse>('/feature-flags');
    return data.flags;
  },

  /**
   * Fetch a specific feature flag by key
   */
  getByKey: async (key: string): Promise<FeatureFlag> => {
    return apiClient<FeatureFlag>(`/feature-flags/${key}`);
  },

  /**
   * Check if a specific feature is enabled
   */
  isEnabled: async (key: string): Promise<boolean> => {
    const data = await apiClient<FeatureFlagEnabledResponse>(`/feature-flags/${key}/enabled`);
    return data.enabled;
  },

  /**
   * Update a feature flag's enabled status
   */
  update: async (key: string, enabled: boolean): Promise<FeatureFlag> => {
    return apiClient<FeatureFlag>(`/feature-flags/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  },
};

// Re-export legacy functions for backwards compatibility during migration
export const fetchAllFeatureFlags = featureFlagsApi.list;
export const fetchFeatureFlag = featureFlagsApi.getByKey;
export const checkFeatureEnabled = featureFlagsApi.isEnabled;
export const updateFeatureFlag = featureFlagsApi.update;

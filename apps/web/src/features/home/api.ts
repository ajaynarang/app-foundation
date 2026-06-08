import { apiClient } from '@/shared/lib/api/client';
import type { HomePulse, RecentLoad } from '@sally/shared-types';

export const homeApi = {
  /** Fetch operational pulse counts for the home page */
  pulse: () => apiClient<HomePulse>('/home/pulse'),

  /** Fetch recently updated loads for the activity feed */
  recentLoads: () => apiClient<RecentLoad[]>('/home/recent-loads'),
};

import { apiClient } from '@/shared/lib/api';
import type { UserPreferences } from '@sally/shared-types';

export async function getTourStatus(): Promise<UserPreferences> {
  return apiClient<UserPreferences>('/settings/general');
}

export async function updateTourStatus(status: 'dismissed' | 'completed'): Promise<UserPreferences> {
  return apiClient<UserPreferences>('/settings/general', {
    method: 'PUT',
    body: JSON.stringify({
      platformTourStatus: status,
      platformTourStatusAt: new Date().toISOString(),
    }),
  });
}

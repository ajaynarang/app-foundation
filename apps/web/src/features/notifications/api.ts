import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { NotificationPreferenceOptions } from '@app/shared-types';

/** What the settings grid may offer — categories and channels come from the notification policy, not a table here. */
export const notificationPreferenceOptionsApi = {
  get(): Promise<NotificationPreferenceOptions> {
    return apiClient<NotificationPreferenceOptions>('/notifications/preferences/options');
  },
};

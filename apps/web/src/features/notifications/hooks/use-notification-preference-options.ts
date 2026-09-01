'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@appshore/web-core/shared/constants';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { notificationPreferenceOptionsApi } from '../api';

export const notificationPreferenceOptionsKey = [...queryKeys.notifications.root, 'preference-options'] as const;

/** Fixed at server boot, so STATIC is the right tier. */
export function useNotificationPreferenceOptions() {
  return useQuery({
    queryKey: notificationPreferenceOptionsKey,
    queryFn: notificationPreferenceOptionsApi.get,
    ...QUERY_TIERS.STATIC,
  });
}

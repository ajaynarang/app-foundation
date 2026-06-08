import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants';
import { emailIntakeApi } from '../api';

/**
 * Returns the number of pending (unreviewed) email threads.
 * Only fetches when `enabled` is true (i.e. email_intake feature flag is on).
 * Refreshes every 60 seconds so the dot stays current without hammering the API.
 */
export function usePendingEmailCount(enabled: boolean) {
  const { data } = useQuery({
    queryKey: queryKeys.emailIngest.threads({ status: 'PENDING', limit: '1' }),
    queryFn: () => emailIntakeApi.listThreads({ status: 'PENDING', limit: '1' }),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return data?.total ?? 0;
}

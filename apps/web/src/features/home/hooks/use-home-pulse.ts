import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { homeApi } from '../api';

/**
 * Fetches operational pulse data for the home page.
 * Uses ACTIVE_POLL tier since the home pulse has no SSE coverage.
 */
export function useHomePulse() {
  return useQuery({
    queryKey: queryKeys.home.pulse,
    queryFn: () => homeApi.pulse(),
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

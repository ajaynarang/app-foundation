import { useQuery } from '@tanstack/react-query';
import { smartAssignApi } from '../api';
import { queryKeys } from '@/shared/constants';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

export function useDriverRecommendations(loadId: string | null) {
  return useQuery({
    queryKey: loadId ? queryKeys.loads.driverRecommendations(loadId) : ['loads', null, 'driver-recommendations'],
    queryFn: () => smartAssignApi.getDriverRecommendations(loadId!),
    enabled: !!loadId,
    // Driver recommendations include live HOS data — not covered by SSE,
    // so we poll to ensure freshness when the sheet is open.
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

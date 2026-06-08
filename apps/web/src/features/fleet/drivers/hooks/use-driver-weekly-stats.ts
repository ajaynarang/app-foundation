import { useQuery } from '@tanstack/react-query';
import { driversApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

export function useDriverWeeklyStats(driverId: string) {
  return useQuery({
    queryKey: ['driver-weekly-stats', driverId],
    queryFn: () => driversApi.getWeeklyStats(driverId),
    enabled: !!driverId,
    ...QUERY_TIERS.STATIC,
  });
}

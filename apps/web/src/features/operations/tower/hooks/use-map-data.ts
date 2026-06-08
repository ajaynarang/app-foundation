import { useQuery } from '@tanstack/react-query';
import { commandCenterApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';

export function useMapData(enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.commandCenter.mapData],
    queryFn: () => commandCenterApi.getMapData(),
    enabled,
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

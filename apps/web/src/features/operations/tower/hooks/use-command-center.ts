import { useQuery } from '@tanstack/react-query';
import { commandCenterApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';

export function useCommandCenterOverview() {
  return useQuery({
    queryKey: [...queryKeys.commandCenter.root, 'overview'],
    queryFn: () => commandCenterApi.getOverview(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: [...queryKeys.commandCenter.root, 'system-health'],
    queryFn: () => commandCenterApi.getSystemHealth(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

import { useQuery } from '@tanstack/react-query';
import { commandCenterApi } from '../api';
import { queryKeys } from '@/shared/constants';

export function useMessageSummary() {
  return useQuery({
    queryKey: [...queryKeys.commandCenter.messageSummary],
    queryFn: () => commandCenterApi.getMessageSummary(),
  });
}

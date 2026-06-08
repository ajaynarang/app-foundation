import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants';
import { emailIntakeApi } from '../api';

export function useEmailThreads(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.emailIngest.threads(params),
    queryFn: () => emailIntakeApi.listThreads(params),
    enabled: params !== undefined,
  });
}

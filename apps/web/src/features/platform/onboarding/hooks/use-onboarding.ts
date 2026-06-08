import { useQuery } from '@tanstack/react-query';
import { onboardingApi } from '../api';
import { queryKeys } from '@/shared/constants';

export function useOnboardingStatus() {
  return useQuery({
    queryKey: queryKeys.onboarding.status,
    queryFn: () => onboardingApi.getStatus(),
  });
}

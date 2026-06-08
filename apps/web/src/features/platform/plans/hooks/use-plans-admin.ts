import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants';
import { plansApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

/**
 * Hook for super-admin plans management page.
 * Fetches all plan configurations with entitlements.
 */
export function usePlansAdmin() {
  return useQuery({
    queryKey: queryKeys.admin.plans,
    queryFn: () => plansApi.getPlans(),
    ...QUERY_TIERS.STATIC,
  });
}

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth';
import { loadsApi } from '@/features/fleet/loads/api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

export function useDriverLoadHistory() {
  const { user } = useAuthStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverId = (user as any)?.driverId ?? '';

  return useQuery({
    queryKey: ['driver-load-history', driverId],
    queryFn: () =>
      loadsApi.list({
        driverId: driverId,
        status: 'DELIVERED',
        limit: 30,
        sortBy: 'deliveredAt',
        sortOrder: 'desc',
      }),
    enabled: !!driverId,
    ...QUERY_TIERS.STATIC,
  });
}

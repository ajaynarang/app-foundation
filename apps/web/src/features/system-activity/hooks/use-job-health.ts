import { useQuery } from '@tanstack/react-query';
import { systemActivityApi } from '../api';
import { SYSTEM_ACTIVITY_KEYS } from '../hooks';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import type { CategorySummary } from '../types';

export function useJobHealth() {
  const { data } = useQuery<CategorySummary[]>({
    queryKey: SYSTEM_ACTIVITY_KEYS.categorySummary(),
    queryFn: () => systemActivityApi.getCategorySummary(),
    ...QUERY_TIERS.ACTIVE_POLL,
  });

  const criticalCount = data?.filter((c) => c.health === 'CRITICAL').length ?? 0;
  const warningCount = data?.filter((c) => c.health === 'WARNING').length ?? 0;

  return {
    criticalCount,
    warningCount,
    hasCritical: criticalCount > 0,
    hasWarning: warningCount > 0,
  };
}

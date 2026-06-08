import { useQuery } from '@tanstack/react-query';
import { listIntegrations } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import type { IntegrationConfig } from '@sally/shared-types';

export function useIntegrations() {
  return useQuery<IntegrationConfig[]>({
    queryKey: queryKeys.integrations.root,
    queryFn: () => listIntegrations(),
    ...QUERY_TIERS.STATIC,
  });
}

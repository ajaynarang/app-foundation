import { useQuery } from '@tanstack/react-query';
import { referenceDataApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import type { ReferenceDataMap } from '../types';

export function useReferenceData(categories?: string | string[]) {
  const categoryList = categories ? (Array.isArray(categories) ? categories : [categories]) : undefined;

  return useQuery<ReferenceDataMap>({
    queryKey: [...queryKeys.referenceData.root, categoryList?.sort().join(',') ?? 'all'],
    queryFn: () => referenceDataApi.get(categoryList),
    ...QUERY_TIERS.STATIC,
  });
}

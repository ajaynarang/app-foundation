'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { horizonApi } from '../api';

export function useHorizon(weekOf: string) {
  return useQuery({
    queryKey: queryKeys.horizon.week(weekOf),
    queryFn: () => horizonApi.getWeek(weekOf),
    staleTime: 30_000,
  });
}

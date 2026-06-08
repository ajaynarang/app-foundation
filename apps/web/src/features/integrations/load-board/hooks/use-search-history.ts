import { useQuery } from '@tanstack/react-query';
import { getSearchHistory } from '../api';
import { queryKeys } from '@/shared/constants';

/** @deprecated Import queryKeys from '@/shared/constants' instead */
export const SEARCH_HISTORY_QUERY_KEY = queryKeys.loadBoard.searchHistory;

export function useSearchHistory(query?: string) {
  return useQuery({
    queryKey: [...queryKeys.loadBoard.searchHistory, query ?? ''],
    queryFn: () => getSearchHistory(query),
    staleTime: 30_000,
  });
}

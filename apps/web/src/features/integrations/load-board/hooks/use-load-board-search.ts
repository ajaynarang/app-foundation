import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { searchLoadBoard } from '../api';
import { queryKeys } from '@/shared/constants';
import type { LoadBoardSearchParams, LoadBoardSearchResult } from '../types';

/** @deprecated Import queryKeys from '@/shared/constants' instead */
export const LOAD_BOARD_QUERY_KEY = queryKeys.loadBoard.search;

export function useLoadBoardSearch(params: LoadBoardSearchParams | null) {
  const queryClient = useQueryClient();

  const result = useQuery<LoadBoardSearchResult>({
    queryKey: [...queryKeys.loadBoard.search, params],
    queryFn: () => searchLoadBoard(params!),
    enabled: !!params,
    staleTime: 60_000,
    retry: 1,
  });

  // Invalidate search history cache after a successful search so new entry appears
  useEffect(() => {
    if (result.isSuccess && params) {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.loadBoard.searchHistory] });
    }
  }, [result.isSuccess, params, queryClient]);

  return result;
}

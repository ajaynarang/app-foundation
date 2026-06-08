import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { getSavedSearches, createSavedSearch, toggleSavedSearch, deleteSavedSearch } from '../api';
import { queryKeys } from '@/shared/constants';
import type { LoadBoardSearchParams } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/** @deprecated Import queryKeys from '@/shared/constants' instead */
export const SAVED_SEARCHES_QUERY_KEY = queryKeys.loadBoard.savedSearches;

export function useSavedSearches() {
  return useQuery({
    queryKey: [...queryKeys.loadBoard.savedSearches],
    queryFn: getSavedSearches,
    staleTime: 30_000,
  });
}

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; searchParams: LoadBoardSearchParams; minRate?: number }) =>
      createSavedSearch(data),
    onSuccess: (data) => {
      showSuccess(`Saved search "${data.name}" created`);
      queryClient.invalidateQueries({ queryKey: queryKeys.loadBoard.savedSearches });
    },
    onError: (error: Error) => {
      showError('Failed to save search', extractErrorMessage(error));
    },
  });
}

export function useToggleSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (savedSearchId: string) => toggleSavedSearch(savedSearchId),
    onSuccess: (data) => {
      showSuccess(data.isActive ? `"${data.name}" alerts enabled` : `"${data.name}" alerts paused`);
      queryClient.invalidateQueries({ queryKey: queryKeys.loadBoard.savedSearches });
    },
    onError: (error: Error) => {
      showError('Failed to toggle saved search', extractErrorMessage(error));
    },
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (savedSearchId: string) => deleteSavedSearch(savedSearchId),
    onSuccess: () => {
      showSuccess('Saved search deleted');
      queryClient.invalidateQueries({ queryKey: queryKeys.loadBoard.savedSearches });
    },
    onError: (error: Error) => {
      showError('Failed to delete saved search', extractErrorMessage(error));
    },
  });
}

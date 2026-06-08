import { useMutation } from '@tanstack/react-query';
import { searchLoadBoardNlp } from '../api';
import { showError } from '@sally/ui';
import type { LoadBoardSearchResult } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useNlpSearch() {
  return useMutation<LoadBoardSearchResult, Error, string>({
    mutationFn: (query) => searchLoadBoardNlp(query),
    onError: (error) => {
      showError(extractErrorMessage(error) || 'Search failed');
    },
  });
}

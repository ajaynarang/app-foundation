import { useMutation } from '@tanstack/react-query';
import { importLoadBoardListing } from '../api';
import { showSuccessWithLink, showError } from '@sally/ui';
import type { LoadBoardImportResult } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useImportLoad() {
  return useMutation<LoadBoardImportResult, Error, { externalId: string; provider?: string }>({
    mutationFn: ({ externalId, provider }) => importLoadBoardListing(externalId, provider),
    onSuccess: (data) => {
      showSuccessWithLink(
        `Load ${data.loadNumber} imported as draft`,
        'View Load',
        `/dispatcher/loads?loadId=${data.loadNumber}`,
      );
    },
    onError: (error) => {
      showError(extractErrorMessage(error) || 'Failed to import load');
    },
  });
}

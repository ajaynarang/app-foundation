import { useMutation, useQueryClient } from '@tanstack/react-query';
import { smartAssignApi } from '../api';
import { showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useDiscardDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) => smartAssignApi.discardDraft(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.root });
      // No success toast — discarding is a background operation; the UI
      // transitions away from the draft immediately, making a toast redundant.
    },
    onError: (error: Error) => {
      showError('Failed to discard draft', extractErrorMessage(error));
    },
  });
}

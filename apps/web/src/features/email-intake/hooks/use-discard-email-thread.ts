import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { emailIntakeApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useDiscardEmailThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => emailIntakeApi.discardThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emailIngest.root });
      showSuccess('Email thread discarded');
    },
    onError: (err: Error) => showError('Failed to discard email thread', extractErrorMessage(err)),
  });
}

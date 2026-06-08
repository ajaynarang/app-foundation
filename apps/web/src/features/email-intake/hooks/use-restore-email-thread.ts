import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants/query-keys';
import { emailIntakeApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useRestoreEmailThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) => emailIntakeApi.restoreThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emailIngest.root });
      showSuccess('Thread restored');
    },
    onError: (error: Error) => {
      showError('Failed to restore', extractErrorMessage(error));
    },
  });
}

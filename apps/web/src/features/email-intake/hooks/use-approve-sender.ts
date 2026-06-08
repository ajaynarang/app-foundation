import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants/query-keys';
import { emailIntakeApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useApproveSender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) => emailIntakeApi.approveSenderAndParse(threadId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emailIngest.root });
      showSuccess(`Approved ${result.domain} — parsing ${result.requeuedCount} attachment(s)`);
    },
    onError: (error: Error) => {
      showError('Failed to approve sender', extractErrorMessage(error));
    },
  });
}

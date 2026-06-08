import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { emailIntakeApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useReparseAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attachmentId }: { attachmentId: string }) => emailIntakeApi.reparseAttachment(attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emailIngest.root });
      showSuccess('Attachment re-queued for parsing');
    },
    onError: (err: Error) => showError('Failed to reparse attachment', extractErrorMessage(err)),
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { emailIntakeApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

interface ConfirmEmailLoadParams {
  threadId: string;
  attachmentId: string;
  customerName?: string;
  referenceNumber?: string;
  rateCents?: number;
  weightLbs?: number;
  commodityType?: string;
}

export function useConfirmEmailLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, ...body }: ConfirmEmailLoadParams) => emailIntakeApi.confirmThread(threadId, body),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emailIngest.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      const loadNumber = result.loadNumber ?? 'unknown';
      showSuccess(`Load confirmed from email (${loadNumber})`);
    },
    onError: (err: Error) => showError('Failed to confirm email load', extractErrorMessage(err)),
  });
}

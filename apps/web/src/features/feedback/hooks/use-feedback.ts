import { useMutation } from '@tanstack/react-query';
import { showSuccess, showError } from '@/shared/lib/toast';
import { feedbackApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useCreateFeedback(options?: { onSuccess?: () => void }) {
  return useMutation({
    mutationFn: (data: { sentiment: number; message: string; page?: string }) => feedbackApi.create(data),
    onSuccess: () => {
      showSuccess('Thanks for your feedback!');
      options?.onSuccess?.();
    },
    onError: (err: Error) => showError('Failed to send feedback', extractErrorMessage(err)),
  });
}

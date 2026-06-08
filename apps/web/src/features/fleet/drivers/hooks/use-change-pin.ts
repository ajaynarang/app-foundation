import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useChangePinMutation() {
  return useMutation({
    mutationFn: (pin: string) =>
      apiClient('/auth/phone/set-pin', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      }),
    onSuccess: () => {
      showSuccess('PIN updated');
    },
    onError: (error: Error) => {
      showError('Failed to update PIN', extractErrorMessage(error));
    },
  });
}

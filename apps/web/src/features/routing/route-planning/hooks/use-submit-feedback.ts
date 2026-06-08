import { useMutation } from '@tanstack/react-query';
import { routePlanningApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: ({
      planId,
      segmentId,
      data,
    }: {
      planId: string;
      segmentId: string;
      data: { rating: 'good' | 'bad'; reason?: string };
    }) => routePlanningApi.submitFeedback(planId, segmentId, data),
    onSuccess: () => {
      showSuccess('Feedback submitted');
    },
    onError: (error: Error) => {
      showError('Failed to submit feedback', extractErrorMessage(error));
    },
  });
}

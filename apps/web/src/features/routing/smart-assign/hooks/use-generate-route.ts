import { useMutation } from '@tanstack/react-query';
import { smartAssignApi } from '../api';
import { showError } from '@sally/ui';
import type { GenerateRouteParams } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useGenerateRoute() {
  return useMutation({
    mutationFn: ({ loadId, params }: { loadId: string; params: GenerateRouteParams }) =>
      smartAssignApi.generateRoute(loadId, params),
    // No success toast: the parent component handles the success transition
    // by advancing to the "result" step, which surfaces the plan UI immediately.
    // A toast here would be redundant noise alongside the visible state change.
    onError: (error: Error) => {
      showError('Failed to generate route', extractErrorMessage(error));
    },
  });
}

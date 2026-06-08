import { useMutation } from '@tanstack/react-query';
import { optimizationApi } from '../api';
import type { RestRecommendationRequest } from '../types';
import { showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useRestRecommendation() {
  return useMutation({
    mutationFn: (request: RestRecommendationRequest) => optimizationApi.recommend(request),
    onError: (error: Error) => {
      showError('Optimization failed', extractErrorMessage(error));
    },
  });
}

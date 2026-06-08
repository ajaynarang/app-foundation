/**
 * React Query hook for running the optimization engine
 */

import { useMutation } from '@tanstack/react-query';
import { optimization } from '@/features/routing/optimization';
import { useEngineStore } from '@/features/routing/optimization';
import type { OptimizationResult, RestRecommendationRequest } from '@/features/routing/optimization';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useEngineRun() {
  const { setResult, setLoading, setError, addToHistory } = useEngineStore();

  return useMutation({
    mutationFn: async (input: RestRecommendationRequest) => {
      setLoading(true);
      const result = await optimization.recommend(input);
      return { input, result };
    },
    onSuccess: ({ input, result }) => {
      setResult(result as OptimizationResult);
      addToHistory(input, result as OptimizationResult);
      showSuccess('Engine run completed');
    },
    onError: (error: Error) => {
      setError(error.message);
      showError('Engine run failed', extractErrorMessage(error));
    },
  });
}

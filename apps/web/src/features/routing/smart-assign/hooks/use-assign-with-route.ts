import { useMutation, useQueryClient } from '@tanstack/react-query';
import { smartAssignApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useAssignWithRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, planId }: { loadId: string; planId: string }) =>
      smartAssignApi.assignWithRoute(loadId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.root });
      showSuccess('Load assigned with smart route');
    },
    onError: (error: Error) => {
      showError('Failed to assign load with route', extractErrorMessage(error));
    },
  });
}

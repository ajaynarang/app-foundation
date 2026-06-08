import { useMutation, useQueryClient } from '@tanstack/react-query';
import { smartAssignApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import type { AssignAllLegsInput } from '@sally/shared-types';

/**
 * Relay-mode assign — assigns drivers/vehicles to all legs of a relay load.
 * Calls POST /loads/:loadId/assign-all-legs
 */
export function useSmartAssignRelay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, assignments }: { loadId: string; assignments: AssignAllLegsInput['assignments'] }) =>
      smartAssignApi.assignAllLegs(loadId, assignments),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.detail(variables.loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.legs(variables.loadId) });
      showSuccess('All relay legs assigned');
    },
    onError: (error: Error) => {
      showError('Failed to assign relay legs', extractErrorMessage(error));
    },
  });
}

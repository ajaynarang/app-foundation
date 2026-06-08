import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loadsApi } from '@/features/fleet/loads/api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/**
 * Basic tier assign — wraps the existing POST /loads/:id/assign endpoint.
 * No route plan is generated; just assigns a driver + vehicle to a load.
 */
export function useSmartAssign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      loadId,
      driverId,
      vehicleId,
      trailerId,
    }: {
      loadId: string;
      driverId: string;
      vehicleId: string;
      trailerId?: string;
    }) => loadsApi.assignLoad(loadId, driverId, vehicleId, trailerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load assigned');
    },
    onError: (error: Error) => {
      showError('Failed to assign load', extractErrorMessage(error));
    },
  });
}

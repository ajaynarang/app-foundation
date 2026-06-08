'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants/query-keys';
import { apiClient } from '@/shared/lib/api/client';

export function useReassignLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loadId, driverId, vehicleId }: { loadId: string; driverId: string; vehicleId: string }) =>
      apiClient(`/loads/${loadId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ driverId, vehicleId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.horizon.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load reassigned');
    },
    onError: (error: Error) => {
      showError('Failed to reassign load', extractErrorMessage(error));
    },
  });
}

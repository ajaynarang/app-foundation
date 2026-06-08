import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { routePlanningApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useGeocodeStops() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (loadIds: string[]) => routePlanningApi.geocodeStops(loadIds),
    onSuccess: (data) => {
      if (data.failed > 0) {
        showError('Some stops could not be geocoded', `${data.geocoded} geocoded, ${data.failed} failed`);
      } else {
        showSuccess(`${data.geocoded} stop${data.geocoded !== 1 ? 's' : ''} geocoded`);
      }
      // Invalidate loads so UI refreshes with new coordinates
      queryClient.invalidateQueries({ queryKey: ['loads'] });
    },
    onError: (error: Error) => {
      showError('Failed to geocode stops', extractErrorMessage(error));
    },
  });
}

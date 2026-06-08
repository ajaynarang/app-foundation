import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EldCandidate {
  eldId: string;
  name: string;
  detail: string;
}

export interface LinkResult {
  linked: boolean;
  eldName?: string;
  eldId?: string;
  matchMethod?: string;
  candidates?: EldCandidate[];
}

// ---------------------------------------------------------------------------
// Mutations — link / unlink drivers
// ---------------------------------------------------------------------------

export function useLinkDriver() {
  const queryClient = useQueryClient();

  return useMutation<LinkResult, Error, { driverDbId: number; eldId?: string }>({
    mutationFn: ({ driverDbId, eldId }) =>
      apiClient<LinkResult>(`/drivers/${driverDbId}/link-eld`, {
        method: 'POST',
        body: JSON.stringify(eldId ? { eldId } : {}),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.root });
      if (data.linked) {
        showSuccess('Driver linked to ELD');
      }
    },
    onError: (error: Error) => {
      showError('Failed to link driver', extractErrorMessage(error));
    },
  });
}

export function useUnlinkDriver() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (driverDbId: number) =>
      apiClient<void>(`/drivers/${driverDbId}/link-eld`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.root });
      showSuccess('Driver unlinked from ELD');
    },
    onError: (error: Error) => {
      showError('Failed to unlink driver', extractErrorMessage(error));
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — link / unlink vehicles
// ---------------------------------------------------------------------------

export function useLinkVehicle() {
  const queryClient = useQueryClient();

  return useMutation<LinkResult, Error, { vehicleDbId: number; eldId?: string }>({
    mutationFn: ({ vehicleDbId, eldId }) =>
      apiClient<LinkResult>(`/vehicles/${vehicleDbId}/link-eld`, {
        method: 'POST',
        body: JSON.stringify(eldId ? { eldId } : {}),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      if (data.linked) {
        showSuccess('Vehicle linked to ELD');
      }
    },
    onError: (error: Error) => {
      showError('Failed to link vehicle', extractErrorMessage(error));
    },
  });
}

export function useUnlinkVehicle() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (vehicleDbId: number) =>
      apiClient<void>(`/vehicles/${vehicleDbId}/link-eld`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      showSuccess('Vehicle unlinked from ELD');
    },
    onError: (error: Error) => {
      showError('Failed to unlink vehicle', extractErrorMessage(error));
    },
  });
}

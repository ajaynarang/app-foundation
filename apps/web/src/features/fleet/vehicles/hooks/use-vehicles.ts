import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi } from '../api';
import type { CreateVehicleRequest, UpdateVehicleRequest } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useVehicles() {
  return useQuery({
    queryKey: queryKeys.vehicles.root,
    queryFn: () => vehiclesApi.list(),
  });
}

export function useVehicleById(vehicleId: string) {
  return useQuery({
    queryKey: queryKeys.vehicles.detail(vehicleId),
    queryFn: () => vehiclesApi.getById(vehicleId),
    enabled: !!vehicleId,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVehicleRequest) => vehiclesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      showSuccess('Vehicle created');
    },
    onError: (error: Error) => {
      showError('Failed to create vehicle', extractErrorMessage(error));
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: string; data: UpdateVehicleRequest }) =>
      vehiclesApi.update(vehicleId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(variables.vehicleId) });
      showSuccess('Vehicle updated');
    },
    onError: (error: Error) => {
      showError('Failed to update vehicle', extractErrorMessage(error));
    },
  });
}

export function useDeactivateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vehicleId, reason }: { vehicleId: string; reason: string }) =>
      vehiclesApi.deactivate(vehicleId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      showSuccess('Vehicle deactivated');
    },
    onError: (error: Error) => {
      showError('Failed to deactivate vehicle', extractErrorMessage(error));
    },
  });
}

export function useReactivateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vehicleId: string) => vehiclesApi.reactivate(vehicleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      showSuccess('Vehicle reactivated');
    },
    onError: (error: Error) => {
      showError('Failed to reactivate vehicle', extractErrorMessage(error));
    },
  });
}

export function useDecommissionVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vehicleId, reason }: { vehicleId: string; reason: string }) =>
      vehiclesApi.decommission(vehicleId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      showSuccess('Vehicle decommissioned');
    },
    onError: (error: Error) => {
      showError('Failed to decommission vehicle', extractErrorMessage(error));
    },
  });
}

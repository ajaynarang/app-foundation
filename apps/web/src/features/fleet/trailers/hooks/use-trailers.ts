import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trailersApi } from '../api';
import type { CreateTrailerRequest, UpdateTrailerRequest } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useTrailers(includeInactive?: boolean) {
  return useQuery({
    queryKey: [...queryKeys.trailers.root, { includeInactive }],
    queryFn: () => trailersApi.list(includeInactive),
  });
}

export function useTrailerById(trailerId: string) {
  return useQuery({
    queryKey: queryKeys.trailers.detail(trailerId),
    queryFn: () => trailersApi.getById(trailerId),
    enabled: !!trailerId,
  });
}

export function useCreateTrailer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrailerRequest) => trailersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.root });
      showSuccess('Trailer created');
    },
    onError: (error: Error) => {
      showError('Failed to create trailer', extractErrorMessage(error));
    },
  });
}

export function useUpdateTrailer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trailerId, data }: { trailerId: string; data: UpdateTrailerRequest }) =>
      trailersApi.update(trailerId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.detail(variables.trailerId) });
      showSuccess('Trailer updated');
    },
    onError: (error: Error) => {
      showError('Failed to update trailer', extractErrorMessage(error));
    },
  });
}

export function useDeactivateTrailer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trailerId, reason }: { trailerId: string; reason: string }) =>
      trailersApi.deactivate(trailerId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.root });
      showSuccess('Trailer deactivated');
    },
    onError: (error: Error) => {
      showError('Failed to deactivate trailer', extractErrorMessage(error));
    },
  });
}

export function useReactivateTrailer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (trailerId: string) => trailersApi.reactivate(trailerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.root });
      showSuccess('Trailer reactivated');
    },
    onError: (error: Error) => {
      showError('Failed to reactivate trailer', extractErrorMessage(error));
    },
  });
}

export function useDecommissionTrailer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trailerId, reason }: { trailerId: string; reason: string }) =>
      trailersApi.decommission(trailerId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.root });
      showSuccess('Trailer decommissioned');
    },
    onError: (error: Error) => {
      showError('Failed to decommission trailer', extractErrorMessage(error));
    },
  });
}

export function useAssignVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trailerId, vehicleId }: { trailerId: string; vehicleId: number }) =>
      trailersApi.assignVehicle(trailerId, vehicleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      showSuccess('Vehicle assigned to trailer');
    },
    onError: (error: Error) => {
      showError('Failed to assign vehicle', extractErrorMessage(error));
    },
  });
}

export function useUnassignVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (trailerId: string) => trailersApi.unassignVehicle(trailerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trailers.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.root });
      showSuccess('Vehicle unassigned from trailer');
    },
    onError: (error: Error) => {
      showError('Failed to unassign vehicle', extractErrorMessage(error));
    },
  });
}

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants/query-keys';
import { horizonApi } from '../api';
import type { CreateDriverUnavailabilityInput, CreateVehicleUnavailabilityInput } from '../types';

export function useCreateDriverUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDriverUnavailabilityInput) => horizonApi.createDriverUnavailability(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.horizon.root });
      showSuccess('Unavailability saved');
    },
    onError: (error: Error) => {
      showError('Failed to save unavailability', extractErrorMessage(error));
    },
  });
}

export function useUpdateDriverUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateDriverUnavailabilityInput> }) =>
      horizonApi.updateDriverUnavailability(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.horizon.root });
      showSuccess('Unavailability updated');
    },
    onError: (error: Error) => {
      showError('Failed to update unavailability', extractErrorMessage(error));
    },
  });
}

export function useDeleteDriverUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => horizonApi.deleteDriverUnavailability(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.horizon.root });
      showSuccess('Unavailability removed');
    },
    onError: (error: Error) => {
      showError('Failed to remove unavailability', extractErrorMessage(error));
    },
  });
}

export function useCreateVehicleUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVehicleUnavailabilityInput) => horizonApi.createVehicleUnavailability(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.horizon.root });
      showSuccess('Vehicle unavailability saved');
    },
    onError: (error: Error) => {
      showError('Failed to save vehicle unavailability', extractErrorMessage(error));
    },
  });
}

export function useDeleteVehicleUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => horizonApi.deleteVehicleUnavailability(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.horizon.root });
      showSuccess('Vehicle unavailability removed');
    },
    onError: (error: Error) => {
      showError('Failed to remove vehicle unavailability', extractErrorMessage(error));
    },
  });
}

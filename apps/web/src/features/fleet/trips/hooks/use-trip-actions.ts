import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tripsApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import type { CreateTripInput, AssignTripInput, UpdateTripInput, AddLoadToTripInput } from '@sally/shared-types';

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTripInput) => tripsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Trip created');
    },
    onError: (e: Error) => {
      showError('Failed to create trip', extractErrorMessage(e));
    },
  });
}

export function useAssignTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, data }: { tripId: string; data: AssignTripInput }) => tripsApi.assign(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Trip assigned');
    },
    onError: (e: Error) => {
      showError('Failed to assign trip', extractErrorMessage(e));
    },
  });
}

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, data }: { tripId: string; data: UpdateTripInput }) => tripsApi.update(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.root });
      showSuccess('Trip updated');
    },
    onError: (e: Error) => {
      showError('Failed to update trip', extractErrorMessage(e));
    },
  });
}

export function useAddLoadToTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, data }: { tripId: string; data: AddLoadToTripInput }) => tripsApi.addLoad(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load added to trip');
    },
    onError: (e: Error) => {
      showError('Failed to add load to trip', extractErrorMessage(e));
    },
  });
}

export function useRemoveLoadFromTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, loadId }: { tripId: string; loadId: string }) => tripsApi.removeLoad(tripId, loadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load removed from trip');
    },
    onError: (e: Error) => {
      showError('Failed to remove load from trip', extractErrorMessage(e));
    },
  });
}

export function useCancelTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => tripsApi.cancel(tripId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Trip cancelled');
    },
    onError: (e: Error) => {
      showError('Failed to cancel trip', extractErrorMessage(e));
    },
  });
}

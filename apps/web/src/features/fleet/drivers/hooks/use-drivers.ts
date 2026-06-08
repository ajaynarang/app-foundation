import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { driversApi } from '../api';
import type { CreateDriverRequest, UpdateDriverRequest } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useDrivers() {
  return useQuery({
    queryKey: queryKeys.drivers.root,
    queryFn: () => driversApi.list(),
  });
}

export function useDriverById(driverId: string) {
  return useQuery({
    queryKey: queryKeys.drivers.detail(driverId),
    queryFn: () => driversApi.getById(driverId),
    enabled: !!driverId,
  });
}

export function useCreateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDriverRequest) => driversApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.root });
      showSuccess('Driver created');
    },
    onError: (error: Error) => {
      showError('Failed to create driver', extractErrorMessage(error));
    },
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ driverId, data }: { driverId: string; data: UpdateDriverRequest }) =>
      driversApi.update(driverId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.detail(variables.driverId) });
      showSuccess('Driver updated');
    },
    onError: (error: Error) => {
      showError('Failed to update driver', extractErrorMessage(error));
    },
  });
}

export function useDeactivateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ driverId, reason }: { driverId: string; reason?: string }) =>
      driversApi.deactivate(driverId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.root });
      showSuccess('Driver deactivated');
    },
    onError: (error: Error) => {
      showError('Failed to deactivate driver', extractErrorMessage(error));
    },
  });
}

export function useReactivateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (driverId: string) => driversApi.reactivate(driverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.root });
      showSuccess('Driver reactivated');
    },
    onError: (error: Error) => {
      showError('Failed to reactivate driver', extractErrorMessage(error));
    },
  });
}

export function useActivateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (driverId: string) => driversApi.activate(driverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.root });
      showSuccess('Driver activated');
    },
    onError: (error: Error) => {
      showError('Failed to activate driver', extractErrorMessage(error));
    },
  });
}

export function useDriverHOS(driverId: string) {
  return useQuery({
    queryKey: queryKeys.drivers.hos(driverId),
    queryFn: () => driversApi.getHOS(driverId),
    enabled: !!driverId,
    staleTime: QUERY_TIERS.ACTIVE_POLL.staleTime,
    refetchInterval: 60_000, // HOS clocks tick per-minute, 30s would be wasteful
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    placeholderData: (prev: any) => prev,
  });
}

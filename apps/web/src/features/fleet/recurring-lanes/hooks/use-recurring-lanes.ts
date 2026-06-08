import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recurringLanesApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import type { RecurringLaneFilters, CreateRecurringLane, UpdateRecurringLane } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useRecurringLanes(filters?: RecurringLaneFilters) {
  return useQuery({
    queryKey: [...queryKeys.recurringLanes.root, filters],
    queryFn: () => recurringLanesApi.list(filters),
  });
}

export function useUpcomingGenerations() {
  return useQuery({
    queryKey: [...queryKeys.recurringLanes.root, 'upcoming'],
    queryFn: () => recurringLanesApi.getUpcoming(),
  });
}

export function useRecurringLane(id: number | null) {
  return useQuery({
    queryKey: [...queryKeys.recurringLanes.root, id],
    queryFn: () => recurringLanesApi.getById(id!),
    enabled: id !== null,
  });
}

export function useCreateLane() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecurringLane) => recurringLanesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringLanes.root });
      showSuccess('Lane created');
    },
    onError: (error: Error) => {
      showError('Failed to create lane', extractErrorMessage(error));
    },
  });
}

export function useUpdateLane() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRecurringLane }) => recurringLanesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringLanes.root });
      showSuccess('Lane updated');
    },
    onError: (error: Error) => {
      showError('Failed to update lane', extractErrorMessage(error));
    },
  });
}

export function useActivateLane() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => recurringLanesApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringLanes.root });
      showSuccess('Lane activated');
    },
    onError: (error: Error) => {
      showError('Failed to activate lane', extractErrorMessage(error));
    },
  });
}

export function usePauseLane() {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.recurringLanes.root;
  return useMutation({
    mutationFn: (id: number) => recurringLanesApi.pause(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previousQueries = queryClient.getQueriesData({ queryKey });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (old?.data) {
          return {
            ...old,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: old.data.map((item: any) => (item.id === id ? { ...item, status: 'PAUSED' } : item)),
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return old?.map?.((item: any) => (item.id === id ? { ...item, status: 'PAUSED' } : item));
      });
      return { previousQueries };
    },
    onSuccess: () => {
      showSuccess('Lane paused');
    },
    onError: (error: Error, _id, context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?.previousQueries?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      showError('Failed to pause lane', extractErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useResumeLane() {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.recurringLanes.root;
  return useMutation({
    mutationFn: (id: number) => recurringLanesApi.resume(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previousQueries = queryClient.getQueriesData({ queryKey });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (old?.data) {
          return {
            ...old,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: old.data.map((item: any) => (item.id === id ? { ...item, status: 'ACTIVE' } : item)),
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return old?.map?.((item: any) => (item.id === id ? { ...item, status: 'ACTIVE' } : item));
      });
      return { previousQueries };
    },
    onSuccess: () => {
      showSuccess('Lane resumed');
    },
    onError: (error: Error, _id, context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?.previousQueries?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      showError('Failed to resume lane', extractErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useGenerateNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => recurringLanesApi.generateLoad(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringLanes.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load generated from lane');
    },
    onError: (error: Error) => {
      showError('Failed to generate load', extractErrorMessage(error));
    },
  });
}

export function useSkipGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => recurringLanesApi.skip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringLanes.root });
      showSuccess('Next generation skipped');
    },
    onError: (error: Error) => {
      showError('Failed to skip generation', extractErrorMessage(error));
    },
  });
}

export function useDeleteLane() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => recurringLanesApi.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringLanes.root });
      showSuccess('Lane deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete lane', extractErrorMessage(error));
    },
  });
}

export function useExpireLane() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => recurringLanesApi.expire(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringLanes.root });
      showSuccess('Lane expired');
    },
    onError: (error: Error) => {
      showError('Failed to expire lane', extractErrorMessage(error));
    },
  });
}

export function useLanePreview(id: number | null) {
  return useQuery({
    queryKey: [...queryKeys.recurringLanes.root, id, 'preview'],
    queryFn: () => recurringLanesApi.preview(id!),
    enabled: id !== null,
  });
}

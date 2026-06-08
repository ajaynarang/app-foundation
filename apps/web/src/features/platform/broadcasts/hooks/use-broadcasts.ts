import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { broadcastsApi, type Broadcast, type CreateBroadcastInput } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useBroadcasts(status?: string) {
  return useQuery<Broadcast[]>({
    queryKey: [...queryKeys.admin.broadcasts, status],
    queryFn: () => broadcastsApi.list(status),
  });
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBroadcastInput) => broadcastsApi.create(input),
    onSuccess: () => {
      showSuccess('Broadcast created');
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.broadcasts });
    },
    onError: (error: Error) => {
      showError('Failed to create broadcast', extractErrorMessage(error));
    },
  });
}

export function useUpdateBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CreateBroadcastInput> }) =>
      broadcastsApi.update(id, input),
    onSuccess: () => {
      showSuccess('Broadcast updated');
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.broadcasts });
    },
    onError: (error: Error) => {
      showError('Failed to update broadcast', extractErrorMessage(error));
    },
  });
}

export function usePublishBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => broadcastsApi.publish(id),
    onSuccess: () => {
      showSuccess('Broadcast published');
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.broadcasts });
    },
    onError: (error: Error) => {
      showError('Failed to publish broadcast', extractErrorMessage(error));
    },
  });
}

export function useArchiveBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => broadcastsApi.archive(id),
    onSuccess: () => {
      showSuccess('Broadcast archived');
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.broadcasts });
    },
    onError: (error: Error) => {
      showError('Failed to archive broadcast', extractErrorMessage(error));
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stopsApi } from '../api';
import { queryKeys } from '@/shared/constants/query-keys';
import { showSuccess, showError } from '@sally/ui';

interface LocationListParams {
  page?: number;
  limit?: number;
  q?: string;
  type?: string;
  state?: string;
  sortBy?: string;
  sortOrder?: string;
}

export function useLocations(params: LocationListParams) {
  return useQuery({
    queryKey: queryKeys.stops.list(params as unknown as Record<string, unknown>),
    queryFn: () => stopsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useLocationById(id: number | null) {
  return useQuery({
    queryKey: queryKeys.stops.detail(id!),
    queryFn: () => stopsApi.getById(id!),
    enabled: id !== null,
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stopsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stops.root });
      showSuccess('Location created');
    },
    onError: () => showError('Failed to create location'),
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof stopsApi.update>[1] }) =>
      stopsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stops.root });
      showSuccess('Location updated');
    },
    onError: () => showError('Failed to update location'),
  });
}

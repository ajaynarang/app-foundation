import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cacheManagementApi } from '../api';
import { showSuccess, showError } from '@/shared/lib/toast';
import { extractErrorMessage } from '@/shared/lib/error-utils';

const CACHE_KEYS = {
  health: ['admin', 'cache', 'health'] as const,
  stats: ['admin', 'cache', 'stats'] as const,
};

export function useCacheHealth() {
  return useQuery({
    queryKey: CACHE_KEYS.health,
    queryFn: cacheManagementApi.getHealth,
    refetchInterval: 30_000,
  });
}

export function useCacheStats() {
  return useQuery({
    queryKey: CACHE_KEYS.stats,
    queryFn: cacheManagementApi.getStats,
    refetchInterval: 15_000,
  });
}

export function useFlushNamespace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (namespace: string) => cacheManagementApi.flushNamespace(namespace),
    onSuccess: (data) => {
      showSuccess(`Flushed ${data.flushed} keys from ${data.scope}`);
      queryClient.invalidateQueries({ queryKey: CACHE_KEYS.stats });
      queryClient.invalidateQueries({ queryKey: CACHE_KEYS.health });
    },
    onError: (error: Error) => {
      showError('Failed to flush namespace', extractErrorMessage(error));
    },
  });
}

export function useFlushAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cacheManagementApi.flushAll(),
    onSuccess: (data) => {
      showSuccess(`Flushed ${data.flushed} keys (all namespaces)`);
      queryClient.invalidateQueries({ queryKey: CACHE_KEYS.stats });
      queryClient.invalidateQueries({ queryKey: CACHE_KEYS.health });
    },
    onError: (error: Error) => {
      showError('Failed to flush all caches', extractErrorMessage(error));
    },
  });
}

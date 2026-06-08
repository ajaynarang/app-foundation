import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { systemActivityApi } from './api';
import { showSuccess, showError } from '@app/ui';
import { QUERY_TIERS } from '../../shared/config/query-tiers';

// Query keys
export const SYSTEM_ACTIVITY_KEYS = {
  categorySummary: () => ['system-activity', 'categories', 'tenant'] as const,
  jobs: (filters: Record<string, unknown>) => ['system-activity', 'jobs', filters] as const,
  job: (jobId: number) => ['system-activity', 'job', jobId] as const,
};

export function useCategorySummary() {
  return useQuery({
    queryKey: SYSTEM_ACTIVITY_KEYS.categorySummary(),
    queryFn: systemActivityApi.getCategorySummary,
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

export function useJobsList(params: {
  category?: string;
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
  /** Set to false to disable polling (e.g., for summary badges). Default: true */
  poll?: boolean;
}) {
  const { poll = true, ...queryParams } = params;
  return useQuery({
    queryKey: SYSTEM_ACTIVITY_KEYS.jobs(queryParams),
    queryFn: () => systemActivityApi.listJobs(queryParams),
    refetchInterval: poll ? 5_000 : false,
    staleTime: poll ? 3_000 : undefined,
  });
}

export function useJob(jobId: number) {
  return useQuery({
    queryKey: SYSTEM_ACTIVITY_KEYS.job(jobId),
    queryFn: () => systemActivityApi.getJob(jobId),
    enabled: !!jobId,
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => systemActivityApi.retryJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-activity'] });
      showSuccess('Job retry initiated');
    },
    onError: (error: Error) => {
      showError('Failed to retry job', error.message);
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => systemActivityApi.cancelJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-activity'] });
      showSuccess('Job cancelled');
    },
    onError: (error: Error) => {
      showError('Failed to cancel job', error.message);
    },
  });
}

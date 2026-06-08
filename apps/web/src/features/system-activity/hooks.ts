import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { systemActivityApi, adminSystemActivityApi, adminSchedulesApi } from './api';
import { showSuccess, showError } from '@sally/ui';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// Query keys
export const SYSTEM_ACTIVITY_KEYS = {
  categorySummary: (admin?: boolean) => ['system-activity', 'categories', admin ? 'admin' : 'tenant'] as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: (filters: Record<string, any>) => ['system-activity', 'jobs', filters] as const,
  job: (jobId: number) => ['system-activity', 'job', jobId] as const,
  metrics: (tenantId?: number) => ['system-activity', 'metrics', tenantId] as const,
  adminCategorySummary: (tenantId: number) => ['system-activity', 'admin-categories', tenantId] as const,
};

// Tenant hooks
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
  dateFrom?: string;
  dateTo?: string;
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
    staleTime: poll ? 3_000 : undefined, // use global default when not polling
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
      showError('Failed to retry job', extractErrorMessage(error));
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
      showError('Failed to cancel job', extractErrorMessage(error));
    },
  });
}

// Super-admin hooks
export function useAdminJobsList(params: {
  tenantId?: number;
  category?: string;
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: SYSTEM_ACTIVITY_KEYS.jobs({ ...params, admin: true }),
    queryFn: () => adminSystemActivityApi.listJobs(params),
    staleTime: 3_000,
    refetchInterval: 5_000,
  });
}

export function useAdminMetrics(tenantId?: number) {
  return useQuery({
    queryKey: SYSTEM_ACTIVITY_KEYS.metrics(tenantId),
    queryFn: () => adminSystemActivityApi.getMetrics(tenantId),
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

export function useAdminCategorySummary(tenantId: number) {
  return useQuery({
    queryKey: SYSTEM_ACTIVITY_KEYS.adminCategorySummary(tenantId),
    queryFn: () => adminSystemActivityApi.getCategorySummary(tenantId),
    ...QUERY_TIERS.ACTIVE_POLL,
    enabled: !!tenantId,
  });
}

export function useAdminRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => adminSystemActivityApi.retryJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-activity'] });
      showSuccess('Job retry initiated');
    },
    onError: (error: Error) => {
      showError('Failed to retry job', extractErrorMessage(error));
    },
  });
}

// Admin schedule hooks
export function useAdminSchedules() {
  return useQuery({
    queryKey: ['admin', 'schedules'],
    queryFn: adminSchedulesApi.list,
    ...QUERY_TIERS.STATIC,
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { pattern?: string; intervalMs?: number; isEnabled?: boolean } }) =>
      adminSchedulesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'schedules'] });
      showSuccess('Schedule updated');
    },
    onError: (error: Error) => {
      showError('Failed to update schedule', extractErrorMessage(error));
    },
  });
}

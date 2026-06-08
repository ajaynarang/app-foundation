import { apiClient } from '@/shared/lib/api';
import type { CategorySummary, PaginatedJobs, Job, JobMetrics } from './types';

// Tenant endpoints
export const systemActivityApi = {
  getCategorySummary: async (): Promise<CategorySummary[]> => {
    return apiClient('/jobs/categories/summary');
  },

  listJobs: async (params?: {
    category?: string;
    type?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedJobs> => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set('category', params.category);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.set('dateTo', params.dateTo);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    const qs = queryParams.toString();
    return apiClient(`/jobs${qs ? `?${qs}` : ''}`);
  },

  getJob: async (jobId: number): Promise<Job> => {
    return apiClient(`/jobs/${jobId}`);
  },

  retryJob: async (jobId: number): Promise<{ jobId: number; status: string }> => {
    return apiClient(`/jobs/${jobId}/retry`, { method: 'POST' });
  },

  cancelJob: async (jobId: number): Promise<void> => {
    return apiClient(`/jobs/${jobId}`, { method: 'DELETE' });
  },
};

// Super-admin endpoints
export const adminSystemActivityApi = {
  listJobs: async (params?: {
    tenantId?: number;
    category?: string;
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedJobs> => {
    const queryParams = new URLSearchParams();
    if (params?.tenantId) queryParams.set('tenantId', params.tenantId.toString());
    if (params?.category) queryParams.set('category', params.category);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    const qs = queryParams.toString();
    return apiClient(`/admin/jobs${qs ? `?${qs}` : ''}`);
  },

  getMetrics: async (tenantId?: number): Promise<JobMetrics> => {
    const qs = tenantId ? `?tenantId=${tenantId}` : '';
    return apiClient(`/admin/jobs/metrics${qs}`);
  },

  getCategorySummary: async (tenantId: number): Promise<CategorySummary[]> => {
    return apiClient(`/admin/jobs/categories/summary?tenantId=${tenantId}`);
  },

  getJob: async (jobId: number): Promise<Job> => {
    return apiClient(`/admin/jobs/${jobId}`);
  },

  retryJob: async (jobId: number): Promise<{ jobId: number; status: string }> => {
    return apiClient(`/admin/jobs/${jobId}/retry`, { method: 'POST' });
  },
};

// Admin schedule endpoints
export const adminSchedulesApi = {
  list: (): Promise<JobSchedule[]> => apiClient('/admin/schedules'),

  update: (id: number, data: { pattern?: string; intervalMs?: number; isEnabled?: boolean }): Promise<JobSchedule> =>
    apiClient(`/admin/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export interface JobSchedule {
  id: number;
  category: string;
  jobType: string;
  scheduleType: 'cron' | 'interval';
  pattern: string | null;
  intervalMs: number | null;
  isEnabled: boolean;
  updatedAt: string;
  updatedBy: number | null;
}

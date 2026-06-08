import { apiClient } from '../../lib/api-client';
import type { CategorySummary, PaginatedJobs, Job } from './types';

export const systemActivityApi = {
  getCategorySummary: async (): Promise<CategorySummary[]> => {
    return apiClient('/jobs/categories/summary');
  },

  listJobs: async (params?: {
    category?: string;
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedJobs> => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set('category', params.category);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.status) queryParams.set('status', params.status);
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

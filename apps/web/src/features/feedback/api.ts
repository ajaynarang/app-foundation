import { apiClient } from '@/shared/lib/api';
import type { FeedbackStatus } from '@sally/shared-types';
import type { Feedback, FeedbackStats, FeedbackListResponse } from './types';

export const feedbackApi = {
  create: (data: { sentiment: number; message: string; page?: string }) =>
    apiClient<Feedback>('/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listOwn: () => apiClient<Feedback[]>('/feedback'),

  listAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient<FeedbackListResponse>(`/admin/feedback${qs}`);
  },

  getDetail: (id: number) => apiClient<Feedback>(`/admin/feedback/${id}`),

  getStats: () => apiClient<FeedbackStats>('/admin/feedback/stats'),

  resolve: (id: number, data: { note: string }) =>
    apiClient<Feedback>(`/admin/feedback/${id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, data: { status: FeedbackStatus }) =>
    apiClient<Feedback>(`/admin/feedback/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  categorize: (id: number) =>
    apiClient<Feedback>(`/admin/feedback/${id}/categorize`, {
      method: 'POST',
    }),

  bulkCategorize: () =>
    apiClient<{ categorized: number; total: number }>('/admin/feedback/bulk-categorize', {
      method: 'POST',
    }),

  getTenants: () => apiClient<{ id: number; companyName: string }[]>('/admin/feedback/tenants'),

  updateCategory: (id: number, data: { category: 'bug' | 'idea' | 'general' }) =>
    apiClient<Feedback>(`/admin/feedback/${id}/category`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

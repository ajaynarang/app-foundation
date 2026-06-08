import { apiClient } from '@/shared/lib/api';
import type {
  RecurringLane,
  PaginatedRecurringLanes,
  RecurringLaneFilters,
  CreateRecurringLane,
  UpdateRecurringLane,
  LanePreview,
} from './types';

export const recurringLanesApi = {
  list: async (params?: RecurringLaneFilters): Promise<PaginatedRecurringLanes> => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return apiClient<PaginatedRecurringLanes>(`/recurring-lanes${qs ? `?${qs}` : ''}`);
  },

  getById: async (id: number): Promise<RecurringLane> => {
    return apiClient<RecurringLane>(`/recurring-lanes/${id}`);
  },

  create: async (data: CreateRecurringLane): Promise<RecurringLane> => {
    return apiClient<RecurringLane>('/recurring-lanes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: UpdateRecurringLane): Promise<RecurringLane> => {
    return apiClient<RecurringLane>(`/recurring-lanes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  expire: async (id: number): Promise<RecurringLane> => {
    return apiClient<RecurringLane>(`/recurring-lanes/${id}`, {
      method: 'DELETE',
    });
  },

  activate: async (id: number): Promise<RecurringLane> => {
    return apiClient<RecurringLane>(`/recurring-lanes/${id}/activate`, {
      method: 'POST',
    });
  },

  pause: async (id: number): Promise<RecurringLane> => {
    return apiClient<RecurringLane>(`/recurring-lanes/${id}/pause`, {
      method: 'POST',
    });
  },

  resume: async (id: number): Promise<RecurringLane> => {
    return apiClient<RecurringLane>(`/recurring-lanes/${id}/resume`, {
      method: 'POST',
    });
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateLoad: async (id: number): Promise<any> => {
    return apiClient(`/recurring-lanes/${id}/generate`, {
      method: 'POST',
    });
  },

  skip: async (id: number): Promise<RecurringLane> => {
    return apiClient<RecurringLane>(`/recurring-lanes/${id}/skip`, {
      method: 'POST',
    });
  },

  preview: async (id: number): Promise<LanePreview> => {
    return apiClient<LanePreview>(`/recurring-lanes/${id}/preview`);
  },

  softDelete: async (id: number): Promise<{ message: string }> => {
    return apiClient<{ message: string }>(`/recurring-lanes/${id}/soft-delete`, {
      method: 'DELETE',
    });
  },

  getUpcoming: async (): Promise<{ data: RecurringLane[]; lookaheadDays: number }> => {
    return apiClient<{ data: RecurringLane[]; lookaheadDays: number }>('/recurring-lanes/upcoming');
  },
};

import { apiClient } from '@/shared/lib/api/client';

export interface Broadcast {
  id: number;
  title: string;
  body: string;
  targetType: 'ALL' | 'PLAN' | 'TENANT';
  targetIds: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  priority: 'INFO' | 'WARNING' | 'CRITICAL';
  publishedAt: string | null;
  expiresAt: string | null;
  createdBy: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type CreateBroadcastInput = {
  title: string;
  body: string;
  targetType?: string;
  targetIds?: string[];
  priority?: string;
  expiresAt?: string;
};

export const broadcastsApi = {
  list: async (status?: string): Promise<Broadcast[]> => {
    const qs = status ? `?status=${status}` : '';
    const data = await apiClient<Broadcast[]>(`/admin/broadcasts${qs}`);
    return Array.isArray(data) ? data : [];
  },

  getOne: async (id: number): Promise<Broadcast> => {
    return apiClient<Broadcast>(`/admin/broadcasts/${id}`);
  },

  create: async (input: CreateBroadcastInput): Promise<Broadcast> => {
    return apiClient<Broadcast>('/admin/broadcasts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update: async (id: number, input: Partial<CreateBroadcastInput>): Promise<Broadcast> => {
    return apiClient<Broadcast>(`/admin/broadcasts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  publish: async (id: number): Promise<Broadcast> => {
    return apiClient<Broadcast>(`/admin/broadcasts/${id}/publish`, {
      method: 'POST',
    });
  },

  archive: async (id: number): Promise<Broadcast> => {
    return apiClient<Broadcast>(`/admin/broadcasts/${id}/archive`, {
      method: 'POST',
    });
  },
};

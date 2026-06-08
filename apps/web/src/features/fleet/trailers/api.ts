import { apiClient } from '@/shared/lib/api';
import type { Trailer, CreateTrailerRequest, UpdateTrailerRequest } from './types';

export const trailersApi = {
  list: async (includeInactive?: boolean): Promise<Trailer[]> => {
    const params = includeInactive ? '?includeInactive=true' : '';
    return apiClient<Trailer[]>(`/trailers${params}`);
  },

  getById: async (trailerId: string): Promise<Trailer> => {
    return apiClient<Trailer>(`/trailers/${trailerId}`);
  },

  create: async (data: CreateTrailerRequest): Promise<Trailer> => {
    return apiClient<Trailer>('/trailers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (trailerId: string, data: UpdateTrailerRequest): Promise<Trailer> => {
    return apiClient<Trailer>(`/trailers/${trailerId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deactivate: async (trailerId: string, reason: string) => {
    return apiClient(`/trailers/${trailerId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  reactivate: async (trailerId: string) => {
    return apiClient(`/trailers/${trailerId}/reactivate`, { method: 'POST' });
  },

  decommission: async (trailerId: string, reason: string) => {
    return apiClient(`/trailers/${trailerId}/decommission`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  assignVehicle: async (trailerId: string, vehicleId: number) => {
    return apiClient(`/trailers/${trailerId}/assign-vehicle`, {
      method: 'POST',
      body: JSON.stringify({ vehicleId }),
    });
  },

  unassignVehicle: async (trailerId: string) => {
    return apiClient(`/trailers/${trailerId}/unassign-vehicle`, {
      method: 'POST',
    });
  },
};

import { apiClient } from '@/shared/lib/api';
import type { Vehicle, CreateVehicleRequest, UpdateVehicleRequest } from './types';

export const vehiclesApi = {
  list: async (includeInactive?: boolean): Promise<Vehicle[]> => {
    const params = includeInactive ? '?includeInactive=true' : '';
    return apiClient<Vehicle[]>(`/vehicles${params}`);
  },

  getById: async (vehicleId: string): Promise<Vehicle> => {
    return apiClient<Vehicle>(`/vehicles/${vehicleId}`);
  },

  create: async (data: CreateVehicleRequest): Promise<Vehicle> => {
    return apiClient<Vehicle>('/vehicles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (vehicleId: string, data: UpdateVehicleRequest): Promise<Vehicle> => {
    return apiClient<Vehicle>(`/vehicles/${vehicleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deactivate: async (vehicleId: string, reason: string) => {
    return apiClient(`/vehicles/${vehicleId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  reactivate: async (vehicleId: string) => {
    return apiClient(`/vehicles/${vehicleId}/reactivate`, { method: 'POST' });
  },

  decommission: async (vehicleId: string, reason: string) => {
    return apiClient(`/vehicles/${vehicleId}/decommission`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

// Re-export legacy functions for backwards compatibility during migration
export const listVehicles = vehiclesApi.list;
export const getVehicle = vehiclesApi.getById;
export const createVehicle = vehiclesApi.create;
export const updateVehicle = vehiclesApi.update;

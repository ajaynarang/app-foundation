import { apiClient } from '@/shared/lib/api/client';
import type { HorizonResponse, CreateDriverUnavailabilityInput, CreateVehicleUnavailabilityInput } from './types';

export const horizonApi = {
  getWeek: (weekOf: string) => apiClient<HorizonResponse>(`/horizon?weekOf=${encodeURIComponent(weekOf)}`),

  createDriverUnavailability: (data: CreateDriverUnavailabilityInput) =>
    apiClient('/driver-unavailability', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDriverUnavailability: (id: number, data: Partial<CreateDriverUnavailabilityInput>) =>
    apiClient(`/driver-unavailability/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteDriverUnavailability: (id: number) => apiClient(`/driver-unavailability/${id}`, { method: 'DELETE' }),

  createVehicleUnavailability: (data: CreateVehicleUnavailabilityInput) =>
    apiClient('/vehicle-unavailability', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateVehicleUnavailability: (id: number, data: Partial<CreateVehicleUnavailabilityInput>) =>
    apiClient(`/vehicle-unavailability/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteVehicleUnavailability: (id: number) => apiClient(`/vehicle-unavailability/${id}`, { method: 'DELETE' }),
};

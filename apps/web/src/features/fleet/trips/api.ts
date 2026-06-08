import { apiClient } from '@/shared/lib/api';
import type {
  TripDetail,
  TripListItem,
  TripListFilters,
  CreateTripInput,
  AssignTripInput,
  UpdateTripInput,
  AddLoadToTripInput,
} from '@sally/shared-types';

export const tripsApi = {
  list: async (params?: TripListFilters) => {
    const queryParams = new URLSearchParams();
    if (params) {
      if (params.status) queryParams.set('status', params.status);
      if (params.driverId) queryParams.set('driverId', params.driverId);
      if (params.vehicleId) queryParams.set('vehicleId', params.vehicleId);
      if (params.search) queryParams.set('search', params.search);
      if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
      if (params.dateTo) queryParams.set('dateTo', params.dateTo);
      if (params.sortBy) queryParams.set('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
      if (params.limit) queryParams.set('limit', String(params.limit));
      if (params.offset !== undefined) queryParams.set('offset', String(params.offset));
    }
    const qs = queryParams.toString();
    return apiClient<{ data: TripListItem[]; total: number }>(qs ? `/trips/?${qs}` : '/trips/');
  },

  getById: async (tripId: string) => apiClient<TripDetail>(`/trips/${tripId}`),

  create: async (data: CreateTripInput) =>
    apiClient<TripDetail>('/trips/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: async (tripId: string, data: UpdateTripInput) =>
    apiClient<TripDetail>(`/trips/${tripId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  assign: async (tripId: string, data: AssignTripInput) =>
    apiClient<TripDetail>(`/trips/${tripId}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  addLoad: async (tripId: string, data: AddLoadToTripInput) =>
    apiClient<TripDetail>(`/trips/${tripId}/loads`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeLoad: async (tripId: string, loadId: string) =>
    apiClient<TripDetail>(`/trips/${tripId}/loads/${loadId}`, {
      method: 'DELETE',
    }),

  cancel: async (tripId: string) =>
    apiClient<TripDetail>(`/trips/${tripId}/cancel`, {
      method: 'POST',
    }),
};

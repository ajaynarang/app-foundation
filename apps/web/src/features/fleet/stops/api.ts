import { apiClient } from '@/shared/lib/api';
import type { PlaceSuggestion, StopSearchResponse, StopSearchResult } from '@sally/shared-types';

export const stopsApi = {
  list: async (params: {
    page?: number;
    limit?: number;
    q?: string;
    type?: string;
    state?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{
    items: StopSearchResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.q) searchParams.set('q', params.q);
    if (params.type) searchParams.set('type', params.type);
    if (params.state) searchParams.set('state', params.state);
    if (params.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    const qs = searchParams.toString();
    return apiClient(`/stops${qs ? `?${qs}` : ''}`);
  },

  getById: async (id: number): Promise<StopSearchResult> => {
    return apiClient(`/stops/${id}`);
  },

  search: async (q?: string, limit = 20): Promise<StopSearchResponse> => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return apiClient<StopSearchResponse>(`/stops/search${qs ? `?${qs}` : ''}`);
  },

  create: async (data: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    locationType?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    operatingHours?: string;
    appointmentRequired?: boolean;
    notes?: string;
  }): Promise<StopSearchResult & { isNew: boolean }> => {
    return apiClient(`/stops`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: number,
    data: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      locationType?: string;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
      operatingHours?: string;
      appointmentRequired?: boolean;
      notes?: string;
    },
  ): Promise<StopSearchResult> => {
    return apiClient(`/stops/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Find-or-create a Stop from a Places autocomplete suggestion (coords inline, no geocode). */
  fromPlace: async (
    suggestion: PlaceSuggestion,
    overrideName?: string,
  ): Promise<StopSearchResult & { isNew: boolean }> => {
    return apiClient('/stops/from-place', {
      method: 'POST',
      body: JSON.stringify({ suggestion, overrideName }),
    });
  },
};

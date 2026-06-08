import { apiClient } from '@/shared/lib/api';
import type { AutocompleteResponse } from './types';

interface AutocompleteOptions {
  sessionToken?: string;
  limit?: number;
}

export const placesApi = {
  autocomplete: async (q: string, opts?: AutocompleteOptions): Promise<AutocompleteResponse> => {
    const params = new URLSearchParams({ q });
    if (opts?.sessionToken) params.set('sessionToken', opts.sessionToken);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return apiClient<AutocompleteResponse>(`/places/autocomplete?${params.toString()}`);
  },
};

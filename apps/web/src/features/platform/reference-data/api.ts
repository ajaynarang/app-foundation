import { apiClient } from '@/shared/lib/api';
import type { ReferenceDataMap } from './types';

export const referenceDataApi = {
  get: async (categories?: string[]): Promise<ReferenceDataMap> => {
    const params = categories?.length ? `?category=${categories.join(',')}` : '';
    return apiClient<ReferenceDataMap>(`/reference-data${params}`);
  },
};

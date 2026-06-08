import { apiClient } from '@/shared/lib/api';
import type { DispatchBoardResponse, DispatchBoardFilters } from './types';

export const dispatchBoardApi = {
  getBoard: async (params?: DispatchBoardFilters): Promise<DispatchBoardResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.filter && params.filter !== 'all') searchParams.set('filter', params.filter);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    const qs = searchParams.toString();
    return apiClient<DispatchBoardResponse>(`/drivers/dispatch-board${qs ? `?${qs}` : ''}`);
  },
};

import { useQuery } from '@tanstack/react-query';
import { getLoadBoardRecommendations } from '../api';
import type { LoadBoardListing } from '../types';

export interface DriverLoadRecommendation {
  driver: {
    id: string;
    name: string;
    location: { city: string; state: string };
  };
  reason: string;
  listings: LoadBoardListing[];
}

/**
 * Request-based recommendations — only fetches when enabled.
 * Dispatcher clicks "Find matches" to trigger.
 */
export function useRecommendations(enabled: boolean) {
  return useQuery<DriverLoadRecommendation[]>({
    queryKey: ['load-board', 'recommendations'],
    queryFn: getLoadBoardRecommendations,
    enabled,
    staleTime: 5 * 60_000,
  });
}

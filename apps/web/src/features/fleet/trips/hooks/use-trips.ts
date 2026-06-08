import { useQuery } from '@tanstack/react-query';
import { tripsApi } from '../api';
import { queryKeys } from '@/shared/constants';
import type { TripListFilters } from '@sally/shared-types';

export function useTrips(params?: TripListFilters) {
  return useQuery({
    queryKey: queryKeys.trips.list(params as Record<string, unknown>),
    queryFn: () => tripsApi.list(params),
  });
}

export function useTripById(tripId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips.detail(tripId!),
    queryFn: () => tripsApi.getById(tripId!),
    enabled: !!tripId,
  });
}

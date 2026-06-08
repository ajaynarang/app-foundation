import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routePlanningApi } from '../api';
import type { CreateRoutePlanRequest } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/**
 * Mutation: Plan a new route
 * Invalidates route-plans list on success
 */
export function usePlanRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoutePlanRequest) => routePlanningApi.plan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.root });
      showSuccess('Route planned');
    },
    onError: (error: Error) => {
      showError('Failed to plan route', extractErrorMessage(error));
    },
  });
}

/**
 * Query: List route plans
 */
export function useRoutePlans(params?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: [...queryKeys.routePlans.root, params],
    queryFn: () => routePlanningApi.list(params),
  });
}

/**
 * Query: Get a specific route plan
 */
export function useRoutePlan(planId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.routePlans.root, planId],
    queryFn: () => routePlanningApi.getById(planId!),
    enabled: !!planId,
  });
}

/**
 * Mutation: Activate a route plan
 */
export function useActivateRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) => routePlanningApi.activate(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.root });
      queryClient.invalidateQueries({ queryKey: ['command-center'] });
      queryClient.invalidateQueries({ queryKey: ['loads'] });
      showSuccess('Route activated');
    },
    onError: (error: Error) => {
      showError('Failed to activate route', extractErrorMessage(error));
    },
  });
}

/**
 * Mutation: Cancel a route plan
 */
export function useCancelRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) => routePlanningApi.cancel(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.root });
      queryClient.invalidateQueries({ queryKey: ['command-center'] });
      queryClient.invalidateQueries({ queryKey: ['loads'] });
      showSuccess('Route cancelled');
    },
    onError: (error: Error) => {
      showError('Failed to cancel route', extractErrorMessage(error));
    },
  });
}

/**
 * Query: Get GeoJSON for a route plan (map rendering)
 */
export function useRoutePlanGeoJSON(planId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.routePlans.root, planId, 'geojson'],
    queryFn: () => routePlanningApi.getGeoJSON(planId!),
    enabled: !!planId,
    staleTime: 5 * 60 * 1000, // GeoJSON doesn't change often
  });
}

// useReplanRoute and useUpdateSegmentStatus are exported from use-driver-route-plan.ts
// to avoid duplication — they invalidate both driver and dispatcher query keys.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routePlanningApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/**
 * Query: Fetch the driver's active route plan
 * Polls every 30 seconds for live updates
 */
export function useDriverActiveRoutePlan(driverId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.routePlans.driverActive, driverId],
    queryFn: () => routePlanningApi.getDriverActive(driverId!),
    enabled: !!driverId,
    refetchInterval: 30000,
    staleTime: 10000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    placeholderData: (prev: any) => prev,
  });
}

/**
 * Mutation: Request a replan for an active route
 */
export function useRequestReplan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, reason }: { planId: string; reason?: string }) => routePlanningApi.replan(planId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.driverActive });
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.root });
      showSuccess('Replan requested');
    },
    onError: (error: Error) => {
      showError('Failed to request replan', extractErrorMessage(error));
    },
  });
}

/**
 * Mutation: Update a route segment's status
 */
export function useUpdateSegmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      planId,
      segmentId,
      status,
      actualArrival,
      actualDeparture,
    }: {
      planId: string;
      segmentId: string;
      status: string;
      actualArrival?: string;
      actualDeparture?: string;
    }) =>
      routePlanningApi.updateSegmentStatus(planId, segmentId, {
        status,
        actualArrival,
        actualDeparture,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.driverActive });
      queryClient.invalidateQueries({ queryKey: queryKeys.routePlans.root });
    },
    onError: (error: Error) => {
      showError('Failed to update segment', extractErrorMessage(error));
    },
  });
}

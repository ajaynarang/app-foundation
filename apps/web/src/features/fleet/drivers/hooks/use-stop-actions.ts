import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loadsApi } from '@/features/fleet/loads/api';
import { routePlanningApi } from '@/features/routing/route-planning/api';
import { showSuccess, showError } from '@sally/ui';
import type { LoadStopStatus } from '@sally/shared-types';
import type { RoutePlanResult, RouteSegment } from '@/features/routing/route-planning';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/**
 * Find the dock segment in a route plan that corresponds to a given load stop.
 * Matches by actionType and toLocation containing the stop city.
 */
function findDockSegmentForLoadStop(
  plan: RoutePlanResult,
  stopId: number,
  actionType: string,
  stopCity?: string,
): RouteSegment | undefined {
  return plan.segments.find((seg) => {
    if (seg.segmentType !== 'dock') return false;
    if (seg.actionType !== actionType) return false;
    // If we have a city, try to match it in the toLocation
    if (stopCity && seg.toLocation) {
      return seg.toLocation.toLowerCase().includes(stopCity.toLowerCase());
    }
    return true;
  });
}

export function useUpdateStopStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      loadId,
      stopId,
      status,
    }: {
      loadId: string;
      stopId: number;
      status: Extract<LoadStopStatus, 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED'>;
      actionType?: string;
      stopCity?: string;
    }) => loadsApi.updateStopStatus(loadId, stopId, status),
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['loads'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      showSuccess('Stop status updated');

      // Bridge: When a stop is completed, also update the corresponding route segment
      if (variables.status === 'COMPLETED') {
        try {
          // Get the active route plan from the query cache
          const planQueries = queryClient.getQueriesData<RoutePlanResult | null>({
            queryKey: ['driver-active-route-plan'],
          });

          for (const [, plan] of planQueries) {
            if (!plan?.planId || !plan.segments?.length) continue;

            const dockSegment = findDockSegmentForLoadStop(
              plan,
              variables.stopId,
              variables.actionType ?? '',
              variables.stopCity,
            );

            if (dockSegment) {
              await routePlanningApi.updateSegmentStatus(plan.planId, dockSegment.segmentId, { status: 'COMPLETED' });
              queryClient.invalidateQueries({ queryKey: ['driver-active-route-plan'] });
              break;
            }
          }
        } catch {
          // Non-blocking: segment update failure shouldn't affect the stop update UX
        }
      }
    },
    onError: (error: Error) => {
      showError('Failed to update stop status', extractErrorMessage(error));
    },
  });
}

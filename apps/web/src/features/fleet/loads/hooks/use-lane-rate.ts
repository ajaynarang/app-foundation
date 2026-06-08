'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants/query-keys';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { laneRateApi } from '../api';
import type { UpsertLaneRateTargetInput } from '@sally/shared-types';

export function useLaneIntelligence(originState?: string, destState?: string, equipmentType?: string) {
  return useQuery({
    queryKey: queryKeys.loads.laneRate(originState!, destState!, equipmentType),
    queryFn: () =>
      laneRateApi.getIntelligence({
        originState: originState!,
        destState: destState!,
        equipmentType,
      }),
    enabled: !!originState && !!destState,
    ...QUERY_TIERS.STATIC,
  });
}

export function useUpsertLaneRateTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertLaneRateTargetInput) => laneRateApi.upsertTarget(data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.loads.laneRate(variables.originState, variables.destinationState),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.laneRateTargets.root,
      });
      showSuccess('Rate target saved');
    },
    onError: (error: Error) => {
      showError('Failed to save rate target', extractErrorMessage(error));
    },
  });
}

export function useDeleteLaneRateTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; originState: string; destState: string }) => laneRateApi.deleteTarget(id),
    onMutate: async (variables) => {
      const qk = queryKeys.loads.laneRate(variables.originState, variables.destState);
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData(qk);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(qk, (old: any) => (old ? { ...old, target: null } : old));
      return { previous, qk };
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.loads.laneRate(variables.originState, variables.destState),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.laneRateTargets.root,
      });
      showSuccess('Rate target removed');
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.qk, context.previous);
      }
      showError('Failed to remove rate target', extractErrorMessage(error));
    },
  });
}

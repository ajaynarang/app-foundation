import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants';
import { driverActionsApi } from '../api/driver-actions';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useDriverActionsByLoad(loadId: string) {
  return useQuery({
    queryKey: queryKeys.driverActions.byLoad(loadId),
    queryFn: () => driverActionsApi.list(loadId),
    enabled: !!loadId,
  });
}

export function useCreateDriverAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loadId,
      ...data
    }: {
      loadId: string;
      actionType: string;
      stopId?: number;
      note?: string;
      metadata?: Record<string, unknown>;
    }) => driverActionsApi.create(loadId, data),
    onSuccess: (result, { loadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.driverActions.byLoad(loadId) });
      const labels: Record<string, string> = {
        detention: 'Detention reported',
        scale_ticket: 'Scale ticket submitted',
        fuel_receipt: 'Fuel receipt submitted',
        issue_report: 'Issue reported — dispatch notified',
      };
      showSuccess(labels[result.actionType] ?? 'Action submitted');
    },
    onError: (e: Error) => showError('Failed to submit', extractErrorMessage(e)),
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { alertsApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import type { ListAlertsParams } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useAlerts(params?: ListAlertsParams) {
  return useQuery({
    queryKey: queryKeys.alerts.list(params as Record<string, unknown>),
    queryFn: () => alertsApi.list(params),
  });
}

export function useAlertById(alertId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.alerts.detail(alertId!),
    queryFn: () => alertsApi.getById(alertId!),
    enabled: !!alertId,
  });
}

export function useAlertStats() {
  return useQuery({
    queryKey: queryKeys.alerts.stats,
    queryFn: () => alertsApi.stats(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => alertsApi.acknowledge(alertId),
    onMutate: async (alertId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.root });
      const previousQueries = queryClient.getQueriesData({ queryKey: queryKeys.alerts.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: queryKeys.alerts.root }, (old: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        old?.map?.((item: any) => (item.alertId === alertId ? { ...item, status: 'ACKNOWLEDGED' } : item)),
      );
      return { previousQueries };
    },
    onSuccess: () => {
      showSuccess('Alert acknowledged');
    },
    onError: (error: Error, _alertId, context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?.previousQueries?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      showError('Failed to acknowledge alert', extractErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.root });
    },
  });
}

export function useSnoozeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, durationMinutes, note }: { alertId: string; durationMinutes: number; note?: string }) =>
      alertsApi.snooze(alertId, durationMinutes, note),
    onSuccess: () => {
      showSuccess('Alert snoozed');
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.root });
    },
    onError: (error: Error) => {
      showError('Failed to snooze alert', extractErrorMessage(error));
    },
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, resolutionNotes }: { alertId: string; resolutionNotes?: string }) =>
      alertsApi.resolve(alertId, resolutionNotes),
    onMutate: async ({ alertId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.root });
      const previousQueries = queryClient.getQueriesData({ queryKey: queryKeys.alerts.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: queryKeys.alerts.root }, (old: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        old?.map?.((item: any) => (item.alertId === alertId ? { ...item, status: 'RESOLVED' } : item)),
      );
      return { previousQueries };
    },
    onSuccess: () => {
      showSuccess('Alert resolved');
    },
    onError: (error: Error, _variables, context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?.previousQueries?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      showError('Failed to resolve alert', extractErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.root });
    },
  });
}

export function useAddAlertNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, content }: { alertId: string; content: string }) => alertsApi.addNote(alertId, content),
    onSuccess: () => {
      showSuccess('Note added');
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.root });
    },
    onError: (error: Error) => {
      showError('Failed to add note', extractErrorMessage(error));
    },
  });
}

export function useBulkAcknowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertIds: string[]) => alertsApi.bulkAcknowledge(alertIds),
    onSuccess: () => {
      showSuccess('Alerts acknowledged');
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.root });
    },
    onError: (error: Error) => {
      showError('Failed to acknowledge alerts', extractErrorMessage(error));
    },
  });
}

export function useBulkResolve() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertIds, resolutionNotes }: { alertIds: string[]; resolutionNotes?: string }) =>
      alertsApi.bulkResolve(alertIds, resolutionNotes),
    onSuccess: () => {
      showSuccess('Alerts resolved');
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.root });
    },
    onError: (error: Error) => {
      showError('Failed to resolve alerts', extractErrorMessage(error));
    },
  });
}

export function useGroupedAlerts(scope: 'driver' | 'load', params?: ListAlertsParams) {
  return useQuery({
    queryKey: queryKeys.alerts.grouped(scope, params as Record<string, unknown>),
    queryFn: () => alertsApi.grouped(scope, params),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useSmartAlertStats() {
  return useQuery({
    queryKey: queryKeys.alerts.smartStats,
    queryFn: () => alertsApi.smartStats(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useAlertBriefing() {
  const queryClient = useQueryClient();

  const cachedQuery = useQuery({
    queryKey: queryKeys.alerts.briefing,
    queryFn: () => alertsApi.getBriefingCached(),
    ...QUERY_TIERS.OPERATIONAL,
  });

  const generateMutation = useMutation({
    mutationFn: (force?: boolean) => alertsApi.generateBriefing(force),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.alerts.briefing, data);
      showSuccess('Briefing generated');
    },
    onError: (error: Error) => {
      showError('Failed to generate briefing', extractErrorMessage(error));
    },
  });

  return {
    briefing: cachedQuery.data,
    isLoading: cachedQuery.isLoading,
    generate: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
  };
}

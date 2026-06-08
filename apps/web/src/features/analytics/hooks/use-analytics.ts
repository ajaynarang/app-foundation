import { useQuery, useMutation } from '@tanstack/react-query';
import { analyticsApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import type { ReportParams, ReportType } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';

export function useKpiDashboard() {
  return useQuery({
    queryKey: [...queryKeys.analytics.root, 'kpi'],
    queryFn: () => analyticsApi.getKpis(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useReportData(type: ReportType, params?: ReportParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.analytics.root, 'report', type, params],
    queryFn: () => analyticsApi.getReport(type, params),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useExportReport() {
  return useMutation({
    mutationFn: ({ type, format, params }: { type: string; format: 'csv' | 'pdf'; params?: ReportParams }) =>
      analyticsApi.exportReport(type, format, params),
    onSuccess: (_blob, variables) => {
      showSuccess(`${variables.format.toUpperCase()} export ready`);
    },
    onError: () => {
      showError('Export failed', 'Something went wrong generating the report. Please try again.');
    },
  });
}

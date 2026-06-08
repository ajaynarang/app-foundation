import { apiClient } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';
import type { KpiDashboard, ReportData, ReportParams } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const analyticsApi = {
  getKpis: async (): Promise<KpiDashboard> => {
    return apiClient<KpiDashboard>('/analytics/kpi');
  },

  getReport: async (type: string, params?: ReportParams): Promise<ReportData> => {
    const qp = new URLSearchParams();
    if (params?.dateFrom) qp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qp.set('dateTo', params.dateTo);
    if (params?.groupBy) qp.set('groupBy', params.groupBy);
    if (params?.limit) qp.set('limit', String(params.limit));
    const qs = qp.toString();
    return apiClient<ReportData>(`/analytics/reports/${type}${qs ? `?${qs}` : ''}`);
  },

  exportReport: async (type: string, format: 'csv' | 'pdf', params?: ReportParams): Promise<string> => {
    const qp = new URLSearchParams();
    qp.set('format', format);
    if (params?.dateFrom) qp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qp.set('dateTo', params.dateTo);
    if (params?.groupBy) qp.set('groupBy', params.groupBy);
    const qs = qp.toString();
    // Export returns CSV text, not JSON — use fetch directly to avoid apiClient's JSON.parse
    const accessToken = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_BASE_URL}/analytics/reports/${type}/export?${qs}`, {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.text();
  },
};

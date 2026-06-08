import { apiClient } from '@/shared/lib/api';
import type { CloseOutSummary, CloseOutListResponse, CloseOutListParams, BillingReadinessResult } from './types';

export const closeOutApi = {
  getSummary: async (): Promise<CloseOutSummary> => {
    return apiClient<CloseOutSummary>('/close-out/summary');
  },

  list: async (params?: CloseOutListParams): Promise<CloseOutListResponse> => {
    const qp = new URLSearchParams();
    if (params?.billingStatus) qp.set('billingStatus', params.billingStatus);
    if (params?.search) qp.set('search', params.search);
    if (params?.dateFrom) qp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qp.set('dateTo', params.dateTo);
    if (params?.limit) qp.set('limit', String(params.limit));
    if (params?.offset) qp.set('offset', String(params.offset));
    const qs = qp.toString();
    return apiClient<CloseOutListResponse>(qs ? `/close-out?${qs}` : '/close-out');
  },

  approveForBilling: async (loadId: string): Promise<{ loadId: string; billingStatus: string }> => {
    return apiClient(`/close-out/${loadId}/approve`, { method: 'POST' });
  },

  getReadiness: async (loadId: string): Promise<BillingReadinessResult> => {
    return apiClient<BillingReadinessResult>(`/close-out/${loadId}/readiness`);
  },

  approveWithOverride: async (
    loadId: string,
    overrideReason: string,
  ): Promise<{ loadId: string; billingStatus: string }> => {
    return apiClient(`/close-out/${loadId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ overrideReason }),
    });
  },

  sendBack: async (loadId: string, reason: string): Promise<{ loadId: string; billingStatus: string }> => {
    return apiClient(`/close-out/${loadId}/send-back`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

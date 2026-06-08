import { apiClient } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';
import type {
  Settlement,
  SettlementSummary,
  DriverPayStructure,
  SettlementDeduction,
  PayStructureType,
  BatchPreviewResponse,
  BatchCalculateResponse,
  BatchActionResponse,
  SettlementListParams,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const settlementsApi = {
  list: async (params?: SettlementListParams): Promise<Settlement[]> => {
    const qp = new URLSearchParams();
    if (params?.status) qp.set('status', params.status);
    if (params?.driverId) qp.set('driverId', params.driverId);
    if (params?.search) qp.set('search', params.search);
    if (params?.periodStart) qp.set('periodStart', params.periodStart);
    if (params?.periodEnd) qp.set('periodEnd', params.periodEnd);
    if (params?.sortBy) qp.set('sortBy', params.sortBy);
    if (params?.sortOrder) qp.set('sortOrder', params.sortOrder);
    if (params?.limit) qp.set('limit', String(params.limit));
    if (params?.offset) qp.set('offset', String(params.offset));
    const qs = qp.toString();
    return apiClient<Settlement[]>(qs ? `/settlements/?${qs}` : '/settlements/');
  },

  getById: async (settlementId: string): Promise<Settlement> => apiClient<Settlement>(`/settlements/${settlementId}`),

  calculate: async (data: {
    driverId: string;
    periodStart: string;
    periodEnd: string;
    preview?: boolean;
  }): Promise<Settlement> => apiClient('/settlements/calculate', { method: 'POST', body: JSON.stringify(data) }),

  addDeduction: async (
    settlementId: string,
    data: { type: string; description: string; amountCents: number },
  ): Promise<SettlementDeduction> =>
    apiClient(`/settlements/${settlementId}/deductions`, { method: 'POST', body: JSON.stringify(data) }),

  removeDeduction: async (settlementId: string, deductionId: number): Promise<void> => {
    await apiClient(`/settlements/${settlementId}/deductions/${deductionId}`, { method: 'DELETE' });
  },

  approve: async (settlementId: string): Promise<Settlement> =>
    apiClient<Settlement>(`/settlements/${settlementId}/approve`, { method: 'POST' }),

  markPaid: async (settlementId: string): Promise<Settlement> =>
    apiClient<Settlement>(`/settlements/${settlementId}/pay`, { method: 'POST' }),

  void: async (settlementId: string): Promise<Settlement> =>
    apiClient<Settlement>(`/settlements/${settlementId}/void`, { method: 'POST' }),

  getSummary: async (params?: { periodStart?: string; periodEnd?: string }): Promise<SettlementSummary> => {
    const qp = new URLSearchParams();
    if (params?.periodStart) qp.set('periodStart', params.periodStart);
    if (params?.periodEnd) qp.set('periodEnd', params.periodEnd);
    const qs = qp.toString();
    return apiClient<SettlementSummary>(qs ? `/settlements/summary?${qs}` : '/settlements/summary');
  },

  updateNotes: async (settlementId: string, notes: string): Promise<void> => {
    await apiClient(`/settlements/${settlementId}/notes`, { method: 'PUT', body: JSON.stringify({ notes }) });
  },

  // Batch operations
  previewBatch: async (data: { periodStart: string; periodEnd: string }): Promise<BatchPreviewResponse> =>
    apiClient('/settlements/preview-batch', { method: 'POST', body: JSON.stringify(data) }),

  batchCalculate: async (data: {
    driverIds: string[];
    periodStart: string;
    periodEnd: string;
  }): Promise<BatchCalculateResponse> =>
    apiClient('/settlements/batch-calculate', { method: 'POST', body: JSON.stringify(data) }),

  batchApprove: async (settlementIds: string[]): Promise<BatchActionResponse> =>
    apiClient('/settlements/batch-approve', { method: 'POST', body: JSON.stringify({ settlementIds }) }),

  batchPay: async (settlementIds: string[]): Promise<BatchActionResponse> =>
    apiClient('/settlements/batch-pay', { method: 'POST', body: JSON.stringify({ settlementIds }) }),

  batchVoid: async (settlementIds: string[]): Promise<BatchActionResponse> =>
    apiClient('/settlements/batch-void', { method: 'POST', body: JSON.stringify({ settlementIds }) }),

  // PDF operations

  /** Get a blob URL for inline PDF preview. */
  getPreviewBlobUrl: async (settlementId: string): Promise<string> => {
    const response = await fetch(`${API_BASE_URL}/settlements/${settlementId}/pdf/preview`, {
      headers: { ...getAuthHeaders() },
      credentials: 'include',
    });
    if (!response.ok) throw new Error('PDF preview failed');
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  downloadPdf: async (settlementId: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/settlements/${settlementId}/pdf`, {
      headers: { ...getAuthHeaders() },
      credentials: 'include',
    });
    if (!response.ok) throw new Error('PDF download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settlement-${settlementId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },

  batchDownloadPdf: async (settlementIds: string[]): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/settlements/batch-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ settlementIds }),
    });
    if (!response.ok) throw new Error('Batch download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settlements-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const payStructuresApi = {
  getByDriverId: async (driverId: string): Promise<DriverPayStructure | null> =>
    apiClient<DriverPayStructure | null>(`/pay-structures/${driverId}`),

  upsert: async (
    driverId: string,
    data: {
      type: PayStructureType;
      ratePerMileCents?: number;
      percentage?: number;
      flatRateCents?: number;
      hybridBaseCents?: number;
      hybridPercent?: number;
      effectiveDate: string;
      notes?: string;
    },
  ): Promise<DriverPayStructure> =>
    apiClient<DriverPayStructure>(`/pay-structures/${driverId}`, { method: 'PUT', body: JSON.stringify(data) }),
};

/**
 * API client functions for loads
 */

import { apiClient } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';
import type {
  Load,
  CreateLoadInput as LoadCreate,
  UpdateDraftLoadInput as LoadUpdate,
  LoadListFilters,
  LoadCharge,
  LoadNote,
  ActivityItem,
  PaginatedLoads,
  RevertLoadInput,
  RevertPreviewResponse,
  LoadLeg,
  CreateLoadLegsInput,
  AssignLegInput,
  UpdateLegStatusInput,
} from './types';
import type { ExchangeRemovalPreview, ExchangeRemovalResolution, ExchangeRemovalResult } from '@sally/shared-types';
import type { ParseRateconResponse, JobStatus as JobStatusItem } from './types/ratecon';
import type { JobStatus as JobStatusEnum } from '@sally/shared-types';
import type { LaneIntelligence, LaneRateTarget, UpsertLaneRateTargetInput } from '@sally/shared-types';

export const loadsApi = {
  list: async (params?: LoadListFilters): Promise<PaginatedLoads> => {
    const queryParams = new URLSearchParams();

    if (params) {
      if (params.status) queryParams.set('status', params.status);
      if (params.customerName) queryParams.set('customerName', params.customerName);
      if (params.driverId) queryParams.set('driverId', params.driverId);
      if (params.equipmentType) queryParams.set('equipmentType', params.equipmentType);
      if (params.search) queryParams.set('search', params.search);
      if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
      if (params.dateTo) queryParams.set('dateTo', params.dateTo);
      if (params.sortBy) queryParams.set('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (params.offset !== undefined) queryParams.set('offset', params.offset.toString());
    }

    const queryString = queryParams.toString();
    const url = queryString ? `/loads/?${queryString}` : '/loads/';

    return apiClient<PaginatedLoads>(url);
  },

  /**
   * Full active set for the dispatcher kanban board.
   * Server returns every DRAFT/PENDING/ASSIGNED/IN_TRANSIT/ON_HOLD load —
   * no client pagination, so kanban cards never silently drop.
   */
  listBoard: async (): Promise<PaginatedLoads> => {
    return apiClient<PaginatedLoads>('/loads/board');
  },

  getById: async (loadId: string): Promise<Load> => {
    return apiClient<Load>(`/loads/${loadId}`);
  },

  create: async (data: LoadCreate): Promise<Load> => {
    return apiClient<Load>('/loads/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateStatus: async (loadId: string, status: string, reason?: string): Promise<Load> => {
    return apiClient<Load>(`/loads/${loadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
    });
  },

  confirmDraft: async (loadId: string): Promise<Load> => {
    return apiClient<Load>(`/loads/${loadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PENDING' }),
    });
  },

  updateDraft: async (loadId: string, data: LoadUpdate): Promise<Load> => {
    return apiClient<Load>(`/loads/${loadId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  duplicate: async (loadId: string): Promise<Load> => {
    return apiClient<Load>(`/loads/${loadId}/duplicate`, { method: 'POST' });
  },

  generateTrackingToken: async (loadId: string): Promise<{ trackingToken: string; trackingUrl: string }> => {
    return apiClient(`/loads/${loadId}/tracking-token`, { method: 'POST' });
  },

  assignLoad: async (loadId: string, driverId: string, vehicleId: string, trailerId?: string) => {
    return apiClient(`/loads/${loadId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ driverId, vehicleId, ...(trailerId ? { trailerId } : {}) }),
    });
  },

  deleteLoad: async (loadId: string) => {
    return apiClient(`/loads/${loadId}`, {
      method: 'DELETE',
    });
  },

  revertDelivery: async (loadId: string, reason: string): Promise<Load> => {
    return apiClient<Load>(`/loads/${loadId}/revert-delivery`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  revertPreview: async (loadId: string, targetStatus: string): Promise<RevertPreviewResponse> => {
    return apiClient<RevertPreviewResponse>(`/loads/${loadId}/revert-preview?targetStatus=${targetStatus}`);
  },

  revertLoad: async (loadId: string, data: RevertLoadInput): Promise<Load> => {
    return apiClient<Load>(`/loads/${loadId}/revert`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ── Legs (relay loads) ──

  getLegs: async (loadId: string): Promise<LoadLeg[]> => {
    return apiClient<LoadLeg[]>(`/loads/${loadId}/legs`);
  },

  createLegs: async (loadId: string, data: CreateLoadLegsInput): Promise<LoadLeg[]> => {
    return apiClient<LoadLeg[]>(`/loads/${loadId}/legs`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  assignLeg: async (loadId: string, legId: string, data: AssignLegInput): Promise<LoadLeg> => {
    return apiClient<LoadLeg>(`/loads/${loadId}/legs/${legId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  advanceLegStatus: async (loadId: string, legId: string, data: UpdateLegStatusInput): Promise<LoadLeg> => {
    return apiClient<LoadLeg>(`/loads/${loadId}/legs/${legId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // ── Exchange points (Pattern A delete vs Pattern B revert) ──

  previewRemoveExchange: async (loadId: string, stopId: number): Promise<ExchangeRemovalPreview> => {
    return apiClient<ExchangeRemovalPreview>(`/loads/${loadId}/exchanges/${stopId}/preview`);
  },

  removeExchange: async (
    loadId: string,
    stopId: number,
    resolve?: ExchangeRemovalResolution,
  ): Promise<ExchangeRemovalResult> => {
    const qs = resolve ? `?resolve=${resolve}` : '';
    return apiClient<ExchangeRemovalResult>(`/loads/${loadId}/exchanges/${stopId}${qs}`, {
      method: 'DELETE',
    });
  },

  // ── Dispatch Sheet ──

  getDispatchSheetPdf: async (loadId: string, legId: string): Promise<Blob> => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = useAuthStore.getState().accessToken;
    const response = await fetch(`${baseUrl}/loads/${loadId}/legs/${legId}/dispatch-sheet/pdf`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to download dispatch sheet' }));
      throw new Error(error.message || 'Failed to download dispatch sheet');
    }
    return response.blob();
  },

  sendDispatchSheet: async (loadId: string, legId: string): Promise<{ sent: boolean; sentTo: string }> => {
    return apiClient(`/loads/${loadId}/legs/${legId}/dispatch-sheet/send`, {
      method: 'POST',
    });
  },

  // Load-level dispatch sheet (non-relay loads)
  getLoadDispatchSheetPdf: async (loadId: string): Promise<Blob> => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = useAuthStore.getState().accessToken;
    const response = await fetch(`${baseUrl}/loads/${loadId}/dispatch-sheet/pdf`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to download dispatch sheet' }));
      throw new Error(error.detail || error.message || 'Failed to download dispatch sheet');
    }
    return response.blob();
  },

  sendLoadDispatchSheet: async (loadId: string): Promise<{ sent: boolean; sentTo: string }> => {
    return apiClient(`/loads/${loadId}/dispatch-sheet/send`, {
      method: 'POST',
    });
  },

  getDriverView: async (loadId: string) => {
    return apiClient(`/loads/${loadId}/driver-view`);
  },

  // ── Stop status ──

  updateStopStatus: async (loadId: string, stopId: number, status: string) => {
    return apiClient(`/loads/${loadId}/stops/${stopId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // ── Charges ──

  getCharges: async (loadId: string): Promise<LoadCharge[]> => {
    return apiClient<LoadCharge[]>(`/loads/${loadId}/charges`);
  },

  addCharge: async (
    loadId: string,
    data: {
      chargeType: string;
      description: string;
      quantity: number;
      unitPriceCents: number;
      isBillable?: boolean;
      isPayable?: boolean;
    },
  ): Promise<LoadCharge> => {
    return apiClient<LoadCharge>(`/loads/${loadId}/charges`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCharge: async (
    loadId: string,
    chargeId: number,
    data: {
      description?: string;
      quantity?: number;
      unitPriceCents?: number;
      isBillable?: boolean;
      isPayable?: boolean;
    },
  ): Promise<LoadCharge> => {
    return apiClient<LoadCharge>(`/loads/${loadId}/charges/${chargeId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  removeCharge: async (loadId: string, chargeId: number): Promise<void> => {
    return apiClient(`/loads/${loadId}/charges/${chargeId}`, { method: 'DELETE' });
  },

  // ── Notes ──

  getNotes: async (loadId: string): Promise<LoadNote[]> => {
    return apiClient<LoadNote[]>(`/loads/${loadId}/notes`);
  },

  addNote: async (loadId: string, data: { content: string; noteType?: string }): Promise<LoadNote> => {
    return apiClient<LoadNote>(`/loads/${loadId}/notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  pinNote: async (loadId: string, noteId: number): Promise<LoadNote> => {
    return apiClient<LoadNote>(`/loads/${loadId}/notes/${noteId}`, {
      method: 'PATCH',
    });
  },

  deleteNote: async (loadId: string, noteId: number): Promise<void> => {
    return apiClient(`/loads/${loadId}/notes/${noteId}`, { method: 'DELETE' });
  },

  // ── Activity ──

  getActivity: async (loadId: string): Promise<ActivityItem[]> => {
    return apiClient<ActivityItem[]>(`/loads/${loadId}/activity`);
  },

  // ── Ratecon ──

  getParserConfig: async (): Promise<{ defaultStrategy: string; allowUserOverride: boolean }> => {
    return apiClient('/ai/documents/parser-config');
  },

  parseRatecon: async (file: File, force?: boolean, strategy?: string): Promise<ParseRateconResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = useAuthStore.getState().accessToken;
    const params = new URLSearchParams();
    if (force) params.set('force', 'true');
    if (strategy) params.set('strategy', strategy);
    const qs = params.toString();
    const url = `${baseUrl}/ai/documents/parse-ratecon${qs ? `?${qs}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to parse file' }));
      if (response.status === 409) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = new Error(error.message || 'Already imported') as any;
        err.status = 409;
        err.existingLoadId = error.existingLoadId;
        err.loadNumber = error.loadNumber;
        throw err;
      }
      throw new Error(error.detail || error.message || 'Failed to parse rate confirmation');
    }

    return response.json();
  },
};

// Job tracking API
export const jobsApi = {
  list: async (params?: {
    category?: string;
    type?: string;
    status?: JobStatusEnum[];
    limit?: number;
    dismissed?: boolean;
  }): Promise<{ items: JobStatusItem[]; total: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set('category', params.category);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.status && params.status.length > 0) queryParams.set('status', params.status.join(','));
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.dismissed !== undefined) queryParams.set('dismissed', String(params.dismissed));
    const queryString = queryParams.toString();
    return apiClient(`/jobs${queryString ? `?${queryString}` : ''}`);
  },

  get: async (jobId: number): Promise<JobStatusItem> => {
    return apiClient(`/jobs/${jobId}`);
  },

  retry: async (jobId: number): Promise<{ jobId: number; status: string }> => {
    return apiClient(`/jobs/${jobId}/retry`, { method: 'POST' });
  },

  cancel: async (jobId: number): Promise<void> => {
    return apiClient(`/jobs/${jobId}`, { method: 'DELETE' });
  },

  dismiss: async (jobId: number): Promise<{ jobId: number; dismissed: boolean }> => {
    return apiClient(`/jobs/${jobId}/dismiss`, { method: 'PATCH' });
  },
};

// ── Lane Rate Intelligence ─────────────────────────────────────────────────

export const laneRateApi = {
  getIntelligence: (params: {
    originState: string;
    destState: string;
    equipmentType?: string;
  }): Promise<LaneIntelligence> => {
    const query = new URLSearchParams({
      origin_state: params.originState,
      destination_state: params.destState,
      ...(params.equipmentType ? { equipment_type: params.equipmentType } : {}),
    }).toString();
    return apiClient(`/fleet/lane-rate?${query}`);
  },

  upsertTarget: (data: UpsertLaneRateTargetInput): Promise<LaneRateTarget> =>
    apiClient('/fleet/lane-rate-targets', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTarget: (id: string): Promise<void> => apiClient(`/fleet/lane-rate-targets/${id}`, { method: 'DELETE' }),

  listTargets: (): Promise<LaneRateTarget[]> => apiClient('/fleet/lane-rate-targets'),
};

// Re-export legacy functions for backwards compatibility during migration
export const getLoads = loadsApi.list;
export const getLoad = loadsApi.getById;
export const createLoad = loadsApi.create;

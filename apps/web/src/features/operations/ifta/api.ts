import { apiClient } from '@/shared/lib/api';
import type {
  IftaQuarter,
  IftaQuarterSummary,
  IftaCalculationResult,
  IftaFuelPurchase,
  IftaQuarterStatus,
} from './types';

export const iftaApi = {
  // ── Quarters ──────────────────────────────────────────────────────────
  listQuarters: async (params?: { year?: number; status?: IftaQuarterStatus }): Promise<IftaQuarter[]> => {
    const qp = new URLSearchParams();
    if (params?.year) qp.set('year', String(params.year));
    if (params?.status) qp.set('status', params.status);
    const qs = qp.toString();
    return apiClient<IftaQuarter[]>(qs ? `/ifta/quarters?${qs}` : '/ifta/quarters');
  },

  getQuarterDetail: async (quarterId: string): Promise<IftaQuarter> => {
    return apiClient<IftaQuarter>(`/ifta/quarters/${quarterId}`);
  },

  getQuarterSummary: async (quarterId: string): Promise<IftaQuarterSummary> => {
    return apiClient<IftaQuarterSummary>(`/ifta/quarters/${quarterId}/summary`);
  },

  // ── Calculation ───────────────────────────────────────────────────────
  calculateQuarter: async (quarterId: string): Promise<IftaCalculationResult> => {
    return apiClient<IftaCalculationResult>(`/ifta/quarters/${quarterId}/calculate`, {
      method: 'POST',
    });
  },

  // ── Filing Status ─────────────────────────────────────────────────────
  updateFilingStatus: async (
    quarterId: string,
    data: {
      status: IftaQuarterStatus;
      confirmationNumber?: string;
      filingMethod?: string;
      notes?: string;
    },
  ): Promise<IftaQuarter> => {
    return apiClient<IftaQuarter>(`/ifta/quarters/${quarterId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // ── Fuel Purchases ────────────────────────────────────────────────────
  createFuelPurchase: async (data: {
    purchaseDate: string;
    jurisdiction: string;
    gallons: number;
    pricePerGallon?: number;
    totalCostCents?: number;
    stationName?: string;
    vehicleId?: number;
    driverId?: number;
    notes?: string;
  }): Promise<IftaFuelPurchase> => {
    return apiClient<IftaFuelPurchase>('/ifta/fuel', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteFuelPurchase: async (purchaseId: string): Promise<void> => {
    return apiClient(`/ifta/fuel/${purchaseId}`, {
      method: 'DELETE',
    });
  },

  // ── Manual Mileage ────────────────────────────────────────────────────
  addManualMileage: async (data: {
    jurisdiction: string;
    totalMiles: number;
    year: number;
    quarter: number;
    vehicleId?: number;
    notes?: string;
  }): Promise<void> => {
    return apiClient('/ifta/mileage', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

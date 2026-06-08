import { apiClient, ApiError, refreshAccessToken } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';
import type { IftaFuelPurchase } from '@/features/operations/ifta/types';
import type { FuelReceiptScanResponse } from '@sally/shared-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface LogFuelPayload {
  purchaseDate: string;
  jurisdiction: string;
  gallons: number;
  pricePerGallon?: number;
  stationName?: string;
  notes?: string;
  source?: 'MANUAL' | 'RECEIPT_SCAN';
}

export const driverFuelApi = {
  logFuel: (data: LogFuelPayload): Promise<IftaFuelPurchase> =>
    apiClient<IftaFuelPurchase>('/ifta/fuel', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  scanReceipt: async (file: File): Promise<FuelReceiptScanResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    async function doFetch(token: string | null): Promise<Response> {
      return fetch(`${API_BASE_URL}/ifta/fuel-receipts/scan`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    }

    let response = await doFetch(useAuthStore.getState().accessToken);

    // Handle 401: attempt token refresh then retry once (mirrors apiClient behaviour)
    if (response.status === 401) {
      const newToken = await refreshAccessToken();

      if (newToken) {
        response = await doFetch(newToken);
      } else {
        // Refresh failed — sign out and redirect, same as apiClient
        await useAuthStore.getState().signOut();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new ApiError(401, 'Session expired. Please login again.');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Scan failed' }));
      throw new ApiError(response.status, error.message || `Scan failed (${response.status})`, error);
    }

    return response.json();
  },
};

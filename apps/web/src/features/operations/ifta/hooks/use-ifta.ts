import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { iftaApi } from '../api';
import { queryKeys } from '@/shared/constants';
import type { IftaQuarterStatus } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ── Queries ───────────────────────────────────────────────────────────

export function useIftaQuarters(params?: { year?: number; status?: IftaQuarterStatus }) {
  return useQuery({
    queryKey: [...queryKeys.ifta.root, 'quarters', params],
    queryFn: () => iftaApi.listQuarters(params),
  });
}

export function useIftaQuarterDetail(quarterId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.ifta.root, 'quarters', quarterId],
    queryFn: () => iftaApi.getQuarterDetail(quarterId!),
    enabled: !!quarterId,
  });
}

export function useIftaQuarterSummary(quarterId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.ifta.root, 'quarters', quarterId, 'summary'],
    queryFn: () => iftaApi.getQuarterSummary(quarterId!),
    enabled: !!quarterId,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────

export function useCalculateQuarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quarterId: string) => iftaApi.calculateQuarter(quarterId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifta.root });
      showSuccess('Quarter calculated');
    },
    onError: (error: Error) => {
      showError('Failed to calculate quarter', extractErrorMessage(error));
    },
  });
}

export function useUpdateFilingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      quarterId,
      data,
    }: {
      quarterId: string;
      data: {
        status: IftaQuarterStatus;
        confirmationNumber?: string;
        filingMethod?: string;
        notes?: string;
      };
    }) => iftaApi.updateFilingStatus(quarterId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifta.root });
      showSuccess('Filing status updated');
    },
    onError: (error: Error) => {
      showError('Failed to update filing status', extractErrorMessage(error));
    },
  });
}

export function useCreateFuelPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      purchaseDate: string;
      jurisdiction: string;
      gallons: number;
      pricePerGallon?: number;
      totalCostCents?: number;
      stationName?: string;
      vehicleId?: number;
      driverId?: number;
      notes?: string;
    }) => iftaApi.createFuelPurchase(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifta.root });
      showSuccess('Fuel purchase added');
    },
    onError: (error: Error) => {
      showError('Failed to add fuel purchase', extractErrorMessage(error));
    },
  });
}

export function useDeleteFuelPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (purchaseId: string) => iftaApi.deleteFuelPurchase(purchaseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifta.root });
      showSuccess('Fuel purchase deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete fuel purchase', extractErrorMessage(error));
    },
  });
}

export function useAddManualMileage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      jurisdiction: string;
      totalMiles: number;
      year: number;
      quarter: number;
      vehicleId?: number;
      notes?: string;
    }) => iftaApi.addManualMileage(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifta.root });
      showSuccess('Manual mileage added');
    },
    onError: (error: Error) => {
      showError('Failed to add manual mileage', extractErrorMessage(error));
    },
  });
}

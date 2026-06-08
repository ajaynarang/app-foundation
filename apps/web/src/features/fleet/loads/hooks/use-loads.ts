import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { loadsApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import type { CreateLoadInput as LoadCreate, LoadListFilters, RevertLoadInput } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useLoads(params?: LoadListFilters) {
  return useQuery({
    queryKey: queryKeys.loads.list(params as Record<string, unknown>),
    queryFn: () => loadsApi.list(params),
  });
}

/**
 * Full active set for the dispatcher kanban board.
 * Single source of truth — both the kanban columns and DnD optimistic updates
 * read/write this cache key. Status filtering for columns is done client-side
 * because the full set is in memory; this is correct (and matches the table's
 * server-side search semantics) only because the haystack is complete.
 */
export function useBoardLoads(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.loads.board,
    queryFn: () => loadsApi.listBoard(),
    enabled: options?.enabled ?? true,
  });
}

/**
 * History tab loads (delivered + cancelled).
 * Defaults to disabled so the dispatcher loads page doesn't fetch history
 * data on mount when the user is on the active board.
 */
export function useHistoryLoads(filters: LoadListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.loads.list({ ...filters, _scope: 'history' } as Record<string, unknown>),
    queryFn: () => loadsApi.list(filters),
    enabled: options?.enabled ?? false,
  });
}

export function useLoadById(loadId: string) {
  return useQuery({
    queryKey: queryKeys.loads.detail(loadId),
    queryFn: () => loadsApi.getById(loadId),
    enabled: !!loadId,
  });
}

export function useCreateLoad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LoadCreate) => loadsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load created');
    },
    onError: (error: Error) => {
      showError('Failed to create load', extractErrorMessage(error));
    },
  });
}

export function useUpdateLoadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, status, reason }: { loadId: string; status: string; reason?: string }) =>
      loadsApi.updateStatus(loadId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load status updated');
    },
    onError: (error: Error) => {
      showError('Failed to update load status', extractErrorMessage(error));
    },
  });
}

export function useAssignLoad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, driverId, vehicleId }: { loadId: string; driverId: string; vehicleId: string }) =>
      loadsApi.assignLoad(loadId, driverId, vehicleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load assigned');
    },
    onError: (error: Error) => {
      showError('Failed to assign load', extractErrorMessage(error));
    },
  });
}

export function useDeleteLoad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (loadId: string) => loadsApi.deleteLoad(loadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Load deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete load', extractErrorMessage(error));
    },
  });
}

/** @deprecated Use useRevertLoad instead */
export function useRevertDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, reason }: { loadId: string; reason: string }) => loadsApi.revertDelivery(loadId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      showSuccess('Load reverted to in transit');
    },
    onError: (error: Error) => {
      showError('Failed to revert load', extractErrorMessage(error));
    },
  });
}

export function useRevertPreview(loadId: string | null, targetStatus: string | null) {
  return useQuery({
    queryKey: queryKeys.loads.revertPreview(loadId!, targetStatus!),
    queryFn: () => loadsApi.revertPreview(loadId!, targetStatus!),
    enabled: !!loadId && !!targetStatus,
  });
}

export function useRevertLoad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, data }: { loadId: string; data: RevertLoadInput }) => loadsApi.revertLoad(loadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements.root });
      showSuccess('Load status reverted');
    },
    onError: (error: Error) => {
      showError('Failed to revert load', extractErrorMessage(error));
    },
  });
}

// ── Charges hooks ──

export function useLoadCharges(loadId: string) {
  return useQuery({
    queryKey: queryKeys.loads.charges(loadId),
    queryFn: () => loadsApi.getCharges(loadId),
    enabled: !!loadId,
  });
}

export function useAddCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      loadId,
      data,
    }: {
      loadId: string;
      data: {
        chargeType: string;
        description: string;
        quantity: number;
        unitPriceCents: number;
        isBillable?: boolean;
        isPayable?: boolean;
      };
    }) => loadsApi.addCharge(loadId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.charges(variables.loadId) });
      showSuccess('Charge added');
    },
    onError: (error: Error) => {
      showError('Failed to add charge', extractErrorMessage(error));
    },
  });
}

export function useRemoveCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, chargeId }: { loadId: string; chargeId: number }) => loadsApi.removeCharge(loadId, chargeId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.charges(variables.loadId) });
      showSuccess('Charge removed');
    },
    onError: (error: Error) => {
      showError('Failed to remove charge', extractErrorMessage(error));
    },
  });
}

// ── Notes hooks ──

export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, data }: { loadId: string; data: { content: string; noteType?: string } }) =>
      loadsApi.addNote(loadId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.notes(variables.loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.activity(variables.loadId) });
      showSuccess('Note added');
    },
    onError: (error: Error) => {
      showError('Failed to add note', extractErrorMessage(error));
    },
  });
}

// ── Activity hook ──

export function useLoadActivity(loadId: string) {
  return useQuery({
    queryKey: queryKeys.loads.activity(loadId),
    queryFn: () => loadsApi.getActivity(loadId),
    enabled: !!loadId,
  });
}

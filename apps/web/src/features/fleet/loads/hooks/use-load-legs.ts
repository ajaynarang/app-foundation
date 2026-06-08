'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants';
import { loadsApi } from '../api';
import { useFeatureFlagEnabled } from '@/features/platform/feature-flags';
import { FEATURE_KEYS } from '@sally/shared-types';

import { showSuccess, showError } from '@sally/ui';

/** Whether relay loads feature is enabled for this tenant */
export function useRelayEnabled() {
  const { data: enabled } = useFeatureFlagEnabled(FEATURE_KEYS.RELAY_LOADS);
  return enabled ?? false;
}
import type { CreateLoadLegsInput, AssignLegInput, UpdateLegStatusInput } from '../types';
import type { ExchangeRemovalResolution } from '@sally/shared-types';

export function useLoadLegs(loadId: string) {
  return useQuery({
    queryKey: queryKeys.loads.legs(loadId),
    queryFn: () => loadsApi.getLegs(loadId),
    enabled: !!loadId,
  });
}

export function useCreateLegs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, data }: { loadId: string; data: CreateLoadLegsInput }) => loadsApi.createLegs(loadId, data),
    onSuccess: (_, { loadId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.detail(loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.legs(loadId) });
      showSuccess('Relay legs created');
    },
    onError: (error: Error) => {
      showError('Failed to create legs', error.message);
    },
  });
}

export function useAssignLeg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, legId, data }: { loadId: string; legId: string; data: AssignLegInput }) =>
      loadsApi.assignLeg(loadId, legId, data),
    onSuccess: (_, { loadId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.detail(loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.legs(loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Leg assigned');
    },
    onError: (error: Error) => {
      showError('Failed to assign leg', error.message);
    },
  });
}

export function useAdvanceLegStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, legId, data }: { loadId: string; legId: string; data: UpdateLegStatusInput }) =>
      loadsApi.advanceLegStatus(loadId, legId, data),
    onSuccess: (_, { loadId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.detail(loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.legs(loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Leg status updated');
    },
    onError: (error: Error) => {
      showError('Failed to update leg status', error.message);
    },
  });
}

/**
 * Read-only preview of what `removeExchange` will do. Used to render the
 * right confirmation copy in the AlertDialog *before* the user confirms.
 */
export function useRemoveExchangePreview(loadId: string, stopId: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.loads.exchangeRemovePreview(loadId, stopId ?? 0),
    queryFn: () => loadsApi.previewRemoveExchange(loadId, stopId as number),
    enabled: !!loadId && stopId != null && options?.enabled !== false,
  });
}

/**
 * Remove an exchange point. On 409 ambiguous, the caller should retry with
 * `resolve: 'delete' | 'revert'` after asking the user.
 */
export function useRemoveExchange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      loadId,
      stopId,
      resolve,
    }: {
      loadId: string;
      stopId: number;
      resolve?: ExchangeRemovalResolution;
    }) => loadsApi.removeExchange(loadId, stopId, resolve),
    onSuccess: (_, { loadId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.detail(loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.legs(loadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Exchange point removed');
    },
    // Intentionally no onError at the hook level. The dialog's per-call
    // onError surfaces the user-facing toast with extractErrorMessage; the
    // ambiguous (409) branch is avoided up front by the preview, but if the
    // backend still returns 409 (e.g. on a race), the dialog's onError still
    // catches it and shows a generic toast.
  });
}

export function useDriverView(loadId: string) {
  return useQuery({
    queryKey: queryKeys.loads.driverView(loadId),
    queryFn: () => loadsApi.getDriverView(loadId),
    enabled: !!loadId,
  });
}

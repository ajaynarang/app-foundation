import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@sally/ui';

import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';

import { deskApi } from '../api';
import type { UpdateDeskResponsibilityRequest } from '../types';

export function useResponsibilities() {
  return useQuery({
    queryKey: queryKeys.desk.responsibilities(),
    queryFn: () => deskApi.responsibilities.list(),
  });
}

export function useResponsibility(key: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.desk.responsibility(key ?? ''),
    queryFn: () => deskApi.responsibilities.get(key as string),
    enabled: !!key,
  });
}

export function useResponsibilityUISpec(key: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.desk.responsibilityUISpec(key ?? ''),
    queryFn: () => deskApi.responsibilities.getUISpec(key as string),
    enabled: !!key,
    ...QUERY_TIERS.STATIC,
  });
}

export function useUpdateResponsibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; patch: UpdateDeskResponsibilityRequest }) =>
      deskApi.responsibilities.update(input.key, input.patch),
    onSuccess: (_r, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.responsibilities() });
      qc.invalidateQueries({
        queryKey: queryKeys.desk.responsibility(variables.key),
      });
      qc.invalidateQueries({ queryKey: queryKeys.desk.agents() });
      showSuccess('Responsibility updated');
    },
    onError: (error: Error) => {
      showError('Failed to update responsibility', extractErrorMessage(error));
    },
  });
}

/**
 * Toggle the per-responsibility "Run automatically" switch. Governs ALL
 * autonomous (non-manual) triggers — scheduled today, domain-event / webhook
 * in the future. Optimistically flips the cached detail + list rows so the
 * Switch reacts instantly, then reconciles on settle. Off-by-default —
 * turning this on (with the tenant master switch on) is what arms autonomous
 * runs. Manual "Run now" is never gated by it.
 */
export function useToggleResponsibilityAutonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; autonomyEnabled: boolean }) =>
      deskApi.responsibilities.updateAutonomy(input.key, { autonomyEnabled: input.autonomyEnabled }),
    onMutate: async ({ key, autonomyEnabled }) => {
      const detailKey = queryKeys.desk.responsibility(key);
      const listKey = queryKeys.desk.responsibilities();
      await Promise.all([qc.cancelQueries({ queryKey: detailKey }), qc.cancelQueries({ queryKey: listKey })]);
      const prevDetail = qc.getQueryData(detailKey);
      const prevList = qc.getQueryData(listKey);
      qc.setQueryData(detailKey, (old: { autonomyEnabled?: boolean } | undefined) =>
        old ? { ...old, autonomyEnabled } : old,
      );
      qc.setQueryData(listKey, (old: Array<{ key: string }> | undefined) =>
        old?.map((r) => (r.key === key ? { ...r, autonomyEnabled } : r)),
      );
      return { prevDetail, prevList, detailKey, listKey };
    },
    onSuccess: (_r, { autonomyEnabled }) => {
      showSuccess(autonomyEnabled ? 'Automatic runs on' : 'Automatic runs off');
    },
    onError: (error: Error, _v, ctx) => {
      if (ctx) {
        qc.setQueryData(ctx.detailKey, ctx.prevDetail);
        qc.setQueryData(ctx.listKey, ctx.prevList);
      }
      showError('Failed to update automatic runs', extractErrorMessage(error));
    },
    onSettled: (_r, _e, { key }) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.responsibility(key) });
      qc.invalidateQueries({ queryKey: queryKeys.desk.responsibilities() });
    },
  });
}

export function useRunResponsibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deskApi.responsibilities.run(key),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.episodes() });
      qc.invalidateQueries({ queryKey: queryKeys.desk.agents() });
      if (result.skipped) {
        showSuccess(`Skipped — ${result.skipped.replaceAll('_', ' ')}`);
      } else {
        const opened = result.episodesOpened ?? 0;
        const reused = result.episodesReused ?? 0;
        showSuccess(`Run started — ${opened} new, ${reused} reused`);
      }
    },
    onError: (error: Error) => {
      showError('Failed to start run', extractErrorMessage(error));
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@sally/ui';

import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';

import { DEFAULT_TENANT_TIMEZONE } from '@sally/shared-types';

import { deskApi } from '../api';
import type { DeskScheduleState } from '../types';

/** Tenant-wide master switch: are autonomous Desk runs armed at all? */
export function useDeskSchedule() {
  return useQuery({
    queryKey: queryKeys.desk.schedule(),
    queryFn: () => deskApi.schedule.get(),
  });
}

/**
 * Arm or pause every Desk schedule tenant-wide. Optimistically flips the
 * cached state so the master Switch reacts instantly; reconciles on settle.
 * Off-by-default — flipping it on is required before ANY responsibility runs
 * on its schedule. Manual "Run now" is unaffected either way.
 */
export function useToggleDeskSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => deskApi.schedule.update({ enabled }),
    onMutate: async (enabled) => {
      const key = queryKeys.desk.schedule();
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DeskScheduleState>(key);
      // Preserve the read-only timezone across the optimistic flip — only the
      // enabled flag is changing here; the server refetch reconciles the rest.
      qc.setQueryData<DeskScheduleState>(key, (old) => ({
        enabled,
        timezone: old?.timezone ?? DEFAULT_TENANT_TIMEZONE,
      }));
      return { prev, key };
    },
    onSuccess: (state) => {
      showSuccess(state.enabled ? 'Automatic runs armed' : 'All automatic runs paused');
    },
    onError: (error: Error, _enabled, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      showError('Failed to update automatic runs', extractErrorMessage(error));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.schedule() });
    },
  });
}

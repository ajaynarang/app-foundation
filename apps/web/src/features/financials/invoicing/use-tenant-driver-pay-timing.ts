import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants';
import { tenantDriverPayTimingApi } from './api';
import type { DriverPayTiming, TenantSettingsResponse } from '@sally/shared-types';

const TIMING_LABEL: Record<DriverPayTiming, string> = {
  ON_DELIVERY: 'Pay on load delivery',
  ON_FACTOR_FUND: 'Pay when factor funds',
};

/**
 * Phase 4C — change tenant driver pay timing. Optimistically updates the
 * me-settings cache; reverts on error.
 */
export function useSetTenantDriverPayTiming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timing: DriverPayTiming) => tenantDriverPayTimingApi.set(timing),
    onMutate: async (timing) => {
      await qc.cancelQueries({ queryKey: queryKeys.tenantSettings.root });
      const previous = qc.getQueryData<TenantSettingsResponse>(queryKeys.tenantSettings.root);
      qc.setQueryData<TenantSettingsResponse>(queryKeys.tenantSettings.root, (old) =>
        old
          ? { ...old, driverPayTiming: timing }
          : {
              factoringCompanyId: null,
              factoringCompany: null,
              bundleFormat: 'ZIP',
              driverPayTiming: timing,
            },
      );
      return { previous };
    },
    onSuccess: (_data, timing) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenantSettings.root });
      showSuccess(`Driver pay timing set to "${TIMING_LABEL[timing]}"`);
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(queryKeys.tenantSettings.root, ctx.previous);
      }
      showError('Failed to update driver pay timing', extractErrorMessage(error));
    },
  });
}

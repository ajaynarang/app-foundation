import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants';
import { tenantBundleFormatApi } from './api';
import type { BundleFormat, TenantSettingsResponse } from '@sally/shared-types';

const FORMAT_LABEL: Record<BundleFormat, string> = {
  ZIP: 'ZIP (separate files)',
  MERGED_PDF: 'Merged PDF (single file)',
};

/**
 * Mutation: change the tenant-level factor bundle format. Optimistically
 * patches the me-settings cache so the radio group reflects the change
 * before the server round-trip; reverts on error.
 *
 * Reads happen through `useTenantFactoringDefault()` (which reads the same
 * `/tenants/me/settings` payload) — no separate fetch hook.
 */
export function useSetTenantBundleFormat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (format: BundleFormat) => tenantBundleFormatApi.set(format),
    onMutate: async (format) => {
      await qc.cancelQueries({ queryKey: queryKeys.tenantSettings.root });
      const previous = qc.getQueryData<TenantSettingsResponse>(queryKeys.tenantSettings.root);
      qc.setQueryData<TenantSettingsResponse>(queryKeys.tenantSettings.root, (old) => ({
        factoringCompanyId: old?.factoringCompanyId ?? null,
        factoringCompany: old?.factoringCompany ?? null,
        bundleFormat: format,
      }));
      return { previous };
    },
    onSuccess: (_data, format) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenantSettings.root });
      showSuccess(`Factor bundle format set to ${FORMAT_LABEL[format]}`);
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(queryKeys.tenantSettings.root, ctx.previous);
      }
      showError('Failed to update bundle format', extractErrorMessage(error));
    },
  });
}

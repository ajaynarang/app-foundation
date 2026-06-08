import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError, toast } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { tenantFactoringDefaultApi } from './api';
import { invoicesApi } from '@/features/financials/billing/api';
import { BundleFormatSchema, type TenantSettingsResponse } from '@sally/shared-types';

/**
 * Reads the tenant-level factoring default. Cached at the same staleness as
 * other config-shaped tenant queries — the value is read on every invoice
 * detail render to compute the resolved-factor chip.
 */
export function useTenantFactoringDefault() {
  return useQuery({
    queryKey: queryKeys.tenantSettings.root,
    queryFn: () => tenantFactoringDefaultApi.get(),
    ...QUERY_TIERS.STATIC,
  });
}

/**
 * Pin or unpin the tenant default factoring company. Pass null to unpin.
 * Optimistic update so the ★ icon flips before the server round-trip; the
 * settings query is invalidated on success and on error the previous value
 * is restored.
 *
 * On a non-null pin, also surfaces a re-NOA prompt via toast — the backend
 * `NoaFactorChangeSubscriber` already runs the bulk create server-side, so
 * the toast just lets the dispatcher jump to the inbox to send the new NOAs.
 */
export function usePinFactoringCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (factoringCompanyId: number | null) => tenantFactoringDefaultApi.set(factoringCompanyId),
    onMutate: async (factoringCompanyId) => {
      await qc.cancelQueries({ queryKey: queryKeys.tenantSettings.root });
      const previous = qc.getQueryData<TenantSettingsResponse>(queryKeys.tenantSettings.root);
      qc.setQueryData<TenantSettingsResponse>(queryKeys.tenantSettings.root, (old) => ({
        factoringCompanyId,
        // Keep the prior nested company until the next query refetch fills in
        // the real one — clears immediately on unpin.
        factoringCompany: factoringCompanyId === null ? null : (old?.factoringCompany ?? null),
        // Preserve bundleFormat across this mutation — only the factoring
        // pin is changing here. Falls back to ZIP only when there is no
        // prior cache entry (first render); matches the DB default.
        bundleFormat: old?.bundleFormat ?? BundleFormatSchema.enum.ZIP,
      }));
      return { previous };
    },
    onSuccess: async (_data, factoringCompanyId) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenantSettings.root });
      qc.invalidateQueries({ queryKey: queryKeys.factoringCompanies.root });
      qc.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
      showSuccess(
        factoringCompanyId === null ? 'Unpinned. New invoices will be direct-bill.' : 'Pinned as your factor.',
      );

      if (factoringCompanyId === null) return;

      try {
        // Snapshot the current default *after* invalidation so we can name
        // the factor in the toast.
        const current = await qc.fetchQuery({
          queryKey: queryKeys.tenantSettings.root,
          queryFn: () => tenantFactoringDefaultApi.get(),
        });
        const factorName = current?.factoringCompany?.companyName ?? 'this factor';

        const inbox = await invoicesApi.listNoaInbox({
          factorId: factoringCompanyId,
          status: 'NOT_SENT',
          limit: 1,
          offset: 0,
        });

        if (inbox.total > 0) {
          toast(`${inbox.total} broker${inbox.total === 1 ? '' : 's'} need new NOAs for ${factorName}`, {
            duration: 10_000,
            action: {
              label: 'View inbox',
              onClick: () => {
                window.location.assign('/dispatcher/network?tab=noa');
              },
            },
          });
        }
      } catch {
        // Re-NOA prompt is opportunistic — never block the pin success on
        // inbox-lookup errors.
      }
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(queryKeys.tenantSettings.root, ctx.previous);
      }
      showError('Failed to update factor', extractErrorMessage(error));
    },
  });
}

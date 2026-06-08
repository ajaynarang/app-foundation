import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import type { OrganizationProfile, UpdateOrganizationProfileInput } from '@sally/shared-types';

import { apiClient } from '@/shared/lib/api';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

export const organizationApi = {
  get: () => apiClient<OrganizationProfile>('/tenants/me/profile'),
  update: (data: UpdateOrganizationProfileInput) =>
    apiClient<OrganizationProfile>('/tenants/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

/**
 * Reads the current tenant company profile (OWNER/ADMIN only). Config-shaped
 * data — cached at the STATIC tier; the Organization settings form seeds its
 * inputs from this.
 */
export function useOrganization(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.organization.root,
    queryFn: () => organizationApi.get(),
    enabled: options?.enabled ?? true,
    ...QUERY_TIERS.STATIC,
  });
}

/**
 * Updates the tenant company profile. On success refreshes the profile cache
 * and the Desk schedule cache (which surfaces the same tenant timezone
 * read-only on the Crew tab).
 */
export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateOrganizationProfileInput) => organizationApi.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.organization.root });
      qc.invalidateQueries({ queryKey: queryKeys.desk.schedule() });
      showSuccess('Organization updated');
    },
    onError: (error) => {
      showError('Failed to update organization', extractErrorMessage(error));
    },
  });
}

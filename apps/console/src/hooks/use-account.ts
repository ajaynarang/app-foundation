'use client';

import { useAuthStore } from '../lib/auth-store';

/**
 * Returns the current user's organization info from the auth store.
 * There is no dedicated tenant-profile endpoint for regular users,
 * so we surface what the auth context already provides.
 */
export function useOrganization() {
  const user = useAuthStore((s) => s.user);

  return {
    tenantId: user?.tenantId ?? null,
    companyName: user?.tenantName ?? null,
    contactEmail: user?.email ?? null,
  };
}

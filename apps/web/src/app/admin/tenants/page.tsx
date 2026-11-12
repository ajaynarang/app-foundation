'use client';

import { TenantManagementTabs } from '@/features/platform/admin';
import { PageHeader } from '@/shared/components/page-chrome';

/**
 * Super-admin tenant management — registrations, lifecycle, billing, and
 * add-ons across all tenants. SUPER_ADMIN's default post-login route.
 */
export default function SuperAdminTenantsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tenants" subtitle="Every account, sign-ups waiting on you first" />
      <TenantManagementTabs />
    </div>
  );
}

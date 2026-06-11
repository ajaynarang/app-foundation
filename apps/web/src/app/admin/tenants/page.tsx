'use client';

import { TenantManagementTabs } from '@/features/platform/admin';

/**
 * Super-admin tenant management — registrations, lifecycle, billing, and
 * add-ons across all tenants. SUPER_ADMIN's default post-login route.
 */
export default function SuperAdminTenantsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Tenant Management</h1>
        <p className="text-muted-foreground mt-1">Manage tenant registrations and lifecycle across all statuses</p>
      </div>
      <TenantManagementTabs />
    </div>
  );
}

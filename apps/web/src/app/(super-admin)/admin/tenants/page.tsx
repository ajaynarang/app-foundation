import { TenantManagementTabs } from '@/features/platform/admin/components/tenant-management-tabs';

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

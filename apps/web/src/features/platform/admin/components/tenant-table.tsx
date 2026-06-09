'use client';

import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { TenantPlan } from '@/features/platform/plans';

// Display names for plans
const PLAN_DISPLAY_NAMES: Record<string, string> = {
  STARTER: 'Haul',
  PROFESSIONAL: 'Fleet',
  ENTERPRISE: 'Freight Force',
  TRIAL: 'Trial',
  TRIAL_EXPIRED: 'Trial Expired',
  SUSPENDED: 'Suspended',
};

interface Tenant {
  id: number;
  tenantId: string;
  companyName: string;
  subdomain: string;
  dotNumber: string;
  fleetSize: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  suspendedAt?: string;
  suspensionReason?: string;
  // Plan fields (may be absent on older API responses)
  plan?: TenantPlan;
  fleetLimitWarning?: boolean;
  users?: Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }>;
  _count?: {
    users: number;
    drivers: number;
  };
}

interface TenantTableProps {
  tenants: Tenant[];
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  onApprove?: (tenant: Tenant) => void;
  onReject?: (tenant: Tenant) => void;
  onSuspend?: (tenant: Tenant) => void;
  onReactivate?: (tenant: Tenant) => void;
  onViewDetails?: (tenant: Tenant) => void;
  isLoading?: boolean;
}

export function TenantTable({
  tenants,
  status,
  onApprove,
  onReject,
  onSuspend,
  onReactivate,
  onViewDetails,
  isLoading = false,
}: TenantTableProps) {
  const { formatDateTime } = useFormatters();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <Alert>
        <AlertDescription className="text-foreground">
          No {status.toLowerCase().replace('_', ' ')} tenants
        </AlertDescription>
      </Alert>
    );
  }

  const getStatusDate = (tenant: Tenant) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return formatDateTime(tenant.createdAt);
      case 'ACTIVE':
        return tenant.approvedAt ? formatDateTime(tenant.approvedAt) : '-';
      case 'SUSPENDED':
        return tenant.suspendedAt ? formatDateTime(tenant.suspendedAt) : '-';
      case 'REJECTED':
        return tenant.rejectedAt ? formatDateTime(tenant.rejectedAt) : '-';
      default:
        return '-';
    }
  };

  const getDateLabel = () => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return 'Registered';
      case 'ACTIVE':
        return 'Approved';
      case 'SUSPENDED':
        return 'Suspended';
      case 'REJECTED':
        return 'Rejected';
      default:
        return 'Date';
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead className="hidden sm:table-cell">Subdomain</TableHead>
            <TableHead className="hidden lg:table-cell">DOT Number</TableHead>
            <TableHead className="hidden md:table-cell">Fleet Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Plan</TableHead>
            <TableHead className="hidden lg:table-cell">Admin User</TableHead>
            <TableHead className="hidden lg:table-cell">Contact</TableHead>
            <TableHead className="hidden md:table-cell">{getDateLabel()}</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell className="font-medium">{tenant.companyName}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <code className="text-sm bg-muted px-1 py-0.5 rounded">{tenant.subdomain}.app.example.com</code>
              </TableCell>
              <TableCell className="hidden lg:table-cell">{tenant.dotNumber}</TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="muted">{tenant.fleetSize?.replace('SIZE_', '')}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={tenant.status === 'ACTIVE' ? 'default' : 'muted'}>
                  {tenant.status?.replace('_', ' ')}
                </Badge>
              </TableCell>
              {/* Plan column */}
              <TableCell className="hidden md:table-cell">
                {tenant.plan ? (
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={
                        tenant.plan === 'TRIAL_EXPIRED' || tenant.plan === 'SUSPENDED' ? 'destructive' : 'outline'
                      }
                    >
                      {PLAN_DISPLAY_NAMES[tenant.plan] ?? tenant.plan}
                    </Badge>
                    {tenant.fleetLimitWarning && <AlertTriangle className="h-3.5 w-3.5 text-caution shrink-0" />}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {tenant.users?.[0] && (
                  <>
                    {tenant.users[0].firstName} {tenant.users[0].lastName}
                    <br />
                    <span className="text-sm text-muted-foreground">{tenant.users[0].email}</span>
                  </>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {tenant.contactEmail}
                <br />
                <span className="text-sm text-muted-foreground">{tenant.contactPhone}</span>
              </TableCell>
              <TableCell className="hidden md:table-cell">{getStatusDate(tenant)}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {status === 'PENDING_APPROVAL' && (
                    <>
                      {onApprove && (
                        <Button size="sm" onClick={() => onApprove(tenant)}>
                          Approve
                        </Button>
                      )}
                      {onReject && (
                        <Button size="sm" variant="destructive" onClick={() => onReject(tenant)}>
                          Reject
                        </Button>
                      )}
                    </>
                  )}
                  {status === 'ACTIVE' && onSuspend && (
                    <Button size="sm" variant="outline" onClick={() => onSuspend(tenant)}>
                      Suspend
                    </Button>
                  )}
                  {status === 'SUSPENDED' && onReactivate && (
                    <Button size="sm" variant="outline" onClick={() => onReactivate(tenant)}>
                      Reactivate
                    </Button>
                  )}
                  {onViewDetails && (
                    <Button size="sm" variant="ghost" onClick={() => onViewDetails(tenant)}>
                      Details
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

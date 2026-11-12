'use client';

import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { variantOf } from '@app/ui';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { AlertTriangle } from 'lucide-react';
import type { TenantPlan } from '@/features/platform/plans';
import { TENANT_PLAN_VARIANTS } from '@/features/billing/constants';
import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageLoadingSkeleton,
  RowActions,
  type RowActionItem,
  type RowActionPrimary,
} from '@/shared/components/page-chrome';
import { TENANT_STATUS_VARIANTS } from '../constants';

interface Tenant {
  tenantId: string;
  companyName: string;
  subdomain: string;
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
  seatLimitWarning?: boolean;
  users?: Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }>;
  _count?: {
    users: number;
  };
}

/** The slice of a `useCursorList` result the table reads: rows, the four states, and the footer. */
interface TenantList {
  items: Tenant[];
  total: number;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  isLoadMoreError: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  isRefetching: boolean;
}

interface TenantTableProps {
  list: TenantList;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  onApprove?: (tenant: Tenant) => void;
  onReject?: (tenant: Tenant) => void;
  onSuspend?: (tenant: Tenant) => void;
  onReactivate?: (tenant: Tenant) => void;
  onViewDetails?: (tenant: Tenant) => void;
}

export function TenantTable({
  list,
  status,
  onApprove,
  onReject,
  onSuspend,
  onReactivate,
  onViewDetails,
}: TenantTableProps) {
  const { formatDateTime } = useFormatters();
  const tenants = list.items;
  const statusLabel = TENANT_STATUS_VARIANTS[status].label.toLowerCase();

  if (list.isLoading) return <PageLoadingSkeleton variant="table" rows={6} />;

  if (list.isError) {
    return (
      <ListErrorState
        title={`Couldn't load ${statusLabel} tenants.`}
        error={list.error}
        onRetry={() => void list.refetch()}
        isRetrying={list.isRefetching}
      />
    );
  }

  if (tenants.length === 0) {
    return <PageEmptyState title={`No ${statusLabel} tenants`} />;
  }

  /** The one visible action per state, and the rest behind ⋯. Destructive ones open their own confirm dialog. */
  const actionsFor = (tenant: Tenant): { primary?: RowActionPrimary; items: RowActionItem[] } => {
    const items: RowActionItem[] = [];
    let primary: RowActionPrimary | undefined;
    const name = tenant.companyName;
    if (status === 'PENDING_APPROVAL') {
      if (onApprove) primary = { label: 'Approve', ariaLabel: `Approve ${name}`, onClick: () => onApprove(tenant) };
      if (onReject)
        items.push({
          label: 'Reject…',
          ariaLabel: `Reject ${name}`,
          destructive: true,
          onSelect: () => onReject(tenant),
        });
    }
    if (status === 'SUSPENDED' && onReactivate) {
      primary = { label: 'Reactivate', ariaLabel: `Reactivate ${name}`, onClick: () => onReactivate(tenant) };
    }
    if (onViewDetails) {
      const details = { label: 'Details', ariaLabel: `Open ${name}'s details` };
      if (primary) items.unshift({ ...details, onSelect: () => onViewDetails(tenant) });
      else primary = { ...details, onClick: () => onViewDetails(tenant) };
    }
    if (status === 'ACTIVE' && onSuspend) {
      items.push({
        label: 'Suspend…',
        ariaLabel: `Suspend ${name}`,
        destructive: true,
        onSelect: () => onSuspend(tenant),
      });
    }
    return { primary, items };
  };

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
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Plan</TableHead>
            <TableHead className="hidden lg:table-cell">Admin User</TableHead>
            <TableHead className="hidden lg:table-cell">Contact</TableHead>
            <TableHead className="hidden md:table-cell">{getDateLabel()}</TableHead>
            <TableHead className="w-[1%]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => {
            const tenantStatus = variantOf(TENANT_STATUS_VARIANTS, tenant.status);
            const plan = tenant.plan ? variantOf(TENANT_PLAN_VARIANTS, tenant.plan) : null;
            const actions = actionsFor(tenant);
            return (
              <TableRow key={tenant.tenantId}>
                <TableCell className="font-medium">{tenant.companyName}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <code className="text-sm bg-muted px-1 py-0.5 rounded">{tenant.subdomain}.app.example.com</code>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={tenantStatus.tone}>{tenantStatus.label}</StatusBadge>
                </TableCell>
                {/* Plan column */}
                <TableCell className="hidden md:table-cell">
                  {plan ? (
                    <div className="flex items-center gap-1">
                      <StatusBadge tone={plan.tone}>{plan.label}</StatusBadge>
                      {tenant.seatLimitWarning && <AlertTriangle className="h-3.5 w-3.5 text-caution-text shrink-0" />}
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
                <TableCell className="text-right">
                  <RowActions primary={actions.primary} items={actions.items} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ListFooter
        shown={tenants.length}
        total={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
        loadMoreFailed={list.isLoadMoreError}
      />
    </div>
  );
}

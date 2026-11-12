'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CursorList } from '@app/shared-types';
import { api } from '@appshore/web-core/shared/lib/api';
import { useCursorList } from '@appshore/web-core/shared/list';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@app/ui/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import { showSuccess, showError } from '@app/ui';
import { ListFooter } from '@/shared/components/page-chrome';
import { TenantTable } from './tenant-table';
import { RejectTenantDialog } from './reject-tenant-dialog';
import { SuspendTenantDialog } from './suspend-tenant-dialog';
import { ReactivateTenantDialog } from './reactivate-tenant-dialog';
import { TenantDetailsSheet } from './tenant-details-sheet';

type TenantStatusTab = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

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

/**
 * One status tab's tenants: a cursor list, "Load more" appends. The key stays under ['tenants'] so every
 * mutation below refreshes all four tabs.
 */
function useTenantsByStatus(status: TenantStatusTab) {
  return useCursorList<Tenant>({
    queryKey: ['tenants', status],
    queryFn: (cursor) =>
      api.get<CursorList<Tenant>>(`/tenants?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  });
}

/** The server's total for the tab, once the first page is in. */
const tabCount = (list: ReturnType<typeof useTenantsByStatus>) => (list.isLoading ? '' : `(${list.total})`);

function TenantListFooter({ list }: { list: ReturnType<typeof useTenantsByStatus> }) {
  if (list.items.length === 0) return null;
  return (
    <ListFooter
      shown={list.items.length}
      total={list.total}
      hasMore={list.hasMore}
      onLoadMore={list.loadMore}
      isLoadingMore={list.isLoadingMore}
      loadMoreFailed={list.isLoadMoreError}
    />
  );
}

export function TenantManagementTabs() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('pending');
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; tenant?: Tenant }>({
    open: false,
  });
  const [suspendDialog, setSuspendDialog] = useState<{ open: boolean; tenant?: Tenant }>({
    open: false,
  });
  const [reactivateDialog, setReactivateDialog] = useState<{
    open: boolean;
    tenant?: Tenant;
  }>({ open: false });
  const [detailsDialog, setDetailsDialog] = useState<{ open: boolean; tenant?: Tenant }>({
    open: false,
  });
  const [approveConfirm, setApproveConfirm] = useState<{ tenant: Tenant; fromDetails?: boolean } | null>(null);

  const pending = useTenantsByStatus('PENDING_APPROVAL');
  const active = useTenantsByStatus('ACTIVE');
  const suspended = useTenantsByStatus('SUSPENDED');
  const rejected = useTenantsByStatus('REJECTED');

  const approveMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/tenants/${tenantId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      showSuccess('Tenant approved');
    },
    onError: () => {
      showError('Error', 'Failed to approve tenant. Please try again.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason: string }) =>
      api.post(`/tenants/${tenantId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setRejectDialog({ open: false });
      showSuccess('Tenant rejected');
    },
    onError: () => {
      showError('Error', 'Failed to reject tenant. Please try again.');
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason: string }) =>
      api.post(`/tenants/${tenantId}/suspend`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setSuspendDialog({ open: false });
      showSuccess('Tenant suspended');
    },
    onError: () => {
      showError('Error', 'Failed to suspend tenant. Please try again.');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/tenants/${tenantId}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setReactivateDialog({ open: false });
      showSuccess('Tenant reactivated');
    },
    onError: () => {
      showError('Error', 'Failed to reactivate tenant. Please try again.');
    },
  });

  const handleApprove = (tenant: Tenant) => {
    setApproveConfirm({ tenant });
  };

  const handleReject = (tenant: Tenant) => {
    setRejectDialog({ open: true, tenant });
  };

  const handleSuspend = (tenant: Tenant) => {
    setSuspendDialog({ open: true, tenant });
  };

  const handleReactivate = (tenant: Tenant) => {
    setReactivateDialog({ open: true, tenant });
  };

  const handleViewDetails = (tenant: Tenant) => {
    setDetailsDialog({ open: true, tenant });
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending {tabCount(pending)}</TabsTrigger>
          <TabsTrigger value="active">Active {tabCount(active)}</TabsTrigger>
          <TabsTrigger value="suspended">Suspended {tabCount(suspended)}</TabsTrigger>
          <TabsTrigger value="rejected">Rejected {tabCount(rejected)}</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <TenantTable
            tenants={pending.items}
            status="PENDING_APPROVAL"
            onApprove={handleApprove}
            onReject={handleReject}
            onViewDetails={handleViewDetails}
            isLoading={pending.isLoading}
          />
          <TenantListFooter list={pending} />
        </TabsContent>

        <TabsContent value="active">
          <TenantTable
            tenants={active.items}
            status="ACTIVE"
            onSuspend={handleSuspend}
            onViewDetails={handleViewDetails}
            isLoading={active.isLoading}
          />
          <TenantListFooter list={active} />
        </TabsContent>

        <TabsContent value="suspended">
          <TenantTable
            tenants={suspended.items}
            status="SUSPENDED"
            onReactivate={handleReactivate}
            onViewDetails={handleViewDetails}
            isLoading={suspended.isLoading}
          />
          <TenantListFooter list={suspended} />
        </TabsContent>

        <TabsContent value="rejected">
          <TenantTable
            tenants={rejected.items}
            status="REJECTED"
            onViewDetails={handleViewDetails}
            isLoading={rejected.isLoading}
          />
          <TenantListFooter list={rejected} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {rejectDialog.tenant && (
        <RejectTenantDialog
          open={rejectDialog.open}
          onOpenChange={(open) => setRejectDialog({ open })}
          tenantName={rejectDialog.tenant.companyName}
          onConfirm={(reason) => rejectMutation.mutate({ tenantId: rejectDialog.tenant!.tenantId, reason })}
          isLoading={rejectMutation.isPending}
        />
      )}

      {suspendDialog.tenant && (
        <SuspendTenantDialog
          open={suspendDialog.open}
          onOpenChange={(open) => setSuspendDialog({ open })}
          tenantName={suspendDialog.tenant.companyName}
          onConfirm={(reason) => suspendMutation.mutate({ tenantId: suspendDialog.tenant!.tenantId, reason })}
          isLoading={suspendMutation.isPending}
        />
      )}

      {reactivateDialog.tenant && (
        <ReactivateTenantDialog
          open={reactivateDialog.open}
          onOpenChange={(open) => setReactivateDialog({ open })}
          tenantName={reactivateDialog.tenant.companyName}
          suspensionReason={reactivateDialog.tenant.suspensionReason}
          onConfirm={() => reactivateMutation.mutate(reactivateDialog.tenant!.tenantId)}
          isLoading={reactivateMutation.isPending}
        />
      )}

      {detailsDialog.tenant && (
        <TenantDetailsSheet
          open={detailsDialog.open}
          onOpenChange={(open) => setDetailsDialog({ open })}
          tenantId={detailsDialog.tenant.tenantId}
          tenantName={detailsDialog.tenant.companyName}
          tenantStatus={detailsDialog.tenant.status}
          onApprove={() => {
            setApproveConfirm({ tenant: detailsDialog.tenant!, fromDetails: true });
          }}
          onReject={() => {
            const tenant = detailsDialog.tenant!;
            setDetailsDialog({ open: false });
            setRejectDialog({ open: true, tenant });
          }}
          onSuspend={() => {
            const tenant = detailsDialog.tenant!;
            setDetailsDialog({ open: false });
            setSuspendDialog({ open: true, tenant });
          }}
          onReactivate={(tenantId) => {
            reactivateMutation.mutate(tenantId);
            setDetailsDialog({ open: false });
          }}
        />
      )}

      <AlertDialog open={!!approveConfirm} onOpenChange={(open) => !open && setApproveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Approve {approveConfirm?.tenant.companyName}? This will grant them access to the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (approveConfirm) {
                  approveMutation.mutate(approveConfirm.tenant.tenantId);
                  if (approveConfirm.fromDetails) {
                    setDetailsDialog({ open: false });
                  }
                  setApproveConfirm(null);
                }
              }}
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sally/ui/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { useAuth } from '@/features/auth';
import { showSuccess, showError } from '@sally/ui';
import { TenantTable } from './tenant-table';
import { RejectTenantDialog } from './reject-tenant-dialog';
import { SuspendTenantDialog } from './suspend-tenant-dialog';
import { ReactivateTenantDialog } from './reactivate-tenant-dialog';
import { TenantDetailsSheet } from './tenant-details-sheet';

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

export function TenantManagementTabs() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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

  // Fetch tenants by status
  const fetchTenants = async (status: string) => {
    const response = await fetch(`${apiUrl}/tenants?status=${status}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) throw new Error('Failed to fetch tenants');
    return response.json();
  };

  const { data: pendingTenants, isLoading: pendingLoading } = useQuery({
    queryKey: ['tenants', 'PENDING_APPROVAL'],
    queryFn: () => fetchTenants('PENDING_APPROVAL'),
    enabled: !!accessToken,
  });

  const { data: activeTenants, isLoading: activeLoading } = useQuery({
    queryKey: ['tenants', 'ACTIVE'],
    queryFn: () => fetchTenants('ACTIVE'),
    enabled: !!accessToken,
  });

  const { data: suspendedTenants, isLoading: suspendedLoading } = useQuery({
    queryKey: ['tenants', 'SUSPENDED'],
    queryFn: () => fetchTenants('SUSPENDED'),
    enabled: !!accessToken,
  });

  const { data: rejectedTenants, isLoading: rejectedLoading } = useQuery({
    queryKey: ['tenants', 'REJECTED'],
    queryFn: () => fetchTenants('REJECTED'),
    enabled: !!accessToken,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const response = await fetch(`${apiUrl}/tenants/${tenantId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to approve tenant');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      showSuccess('Tenant approved');
    },
    onError: () => {
      showError('Error', 'Failed to approve tenant. Please try again.');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ tenantId, reason }: { tenantId: string; reason: string }) => {
      const response = await fetch(`${apiUrl}/tenants/${tenantId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error('Failed to reject tenant');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setRejectDialog({ open: false });
      showSuccess('Tenant rejected');
    },
    onError: () => {
      showError('Error', 'Failed to reject tenant. Please try again.');
    },
  });

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: async ({ tenantId, reason }: { tenantId: string; reason: string }) => {
      const response = await fetch(`${apiUrl}/tenants/${tenantId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error('Failed to suspend tenant');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setSuspendDialog({ open: false });
      showSuccess('Tenant suspended');
    },
    onError: () => {
      showError('Error', 'Failed to suspend tenant. Please try again.');
    },
  });

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const response = await fetch(`${apiUrl}/tenants/${tenantId}/reactivate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to reactivate tenant');
      return response.json();
    },
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
          <TabsTrigger value="pending">Pending {pendingTenants ? `(${pendingTenants.length})` : ''}</TabsTrigger>
          <TabsTrigger value="active">Active {activeTenants ? `(${activeTenants.length})` : ''}</TabsTrigger>
          <TabsTrigger value="suspended">
            Suspended {suspendedTenants ? `(${suspendedTenants.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="rejected">Rejected {rejectedTenants ? `(${rejectedTenants.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <TenantTable
            tenants={pendingTenants || []}
            status="PENDING_APPROVAL"
            onApprove={handleApprove}
            onReject={handleReject}
            onViewDetails={handleViewDetails}
            isLoading={pendingLoading}
          />
        </TabsContent>

        <TabsContent value="active">
          <TenantTable
            tenants={activeTenants || []}
            status="ACTIVE"
            onSuspend={handleSuspend}
            onViewDetails={handleViewDetails}
            isLoading={activeLoading}
          />
        </TabsContent>

        <TabsContent value="suspended">
          <TenantTable
            tenants={suspendedTenants || []}
            status="SUSPENDED"
            onReactivate={handleReactivate}
            onViewDetails={handleViewDetails}
            isLoading={suspendedLoading}
          />
        </TabsContent>

        <TabsContent value="rejected">
          <TenantTable
            tenants={rejectedTenants || []}
            status="REJECTED"
            onViewDetails={handleViewDetails}
            isLoading={rejectedLoading}
          />
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

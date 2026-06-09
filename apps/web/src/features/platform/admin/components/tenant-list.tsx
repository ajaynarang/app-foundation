'use client';

import { useState } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@app/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@app/ui/components/ui/card';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';
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
import { Textarea } from '@app/ui/components/ui/textarea';
import { Label } from '@app/ui/components/ui/label';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useAuth } from '@/features/auth';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function TenantList() {
  const { formatTimestamp } = useFormatters();
  const { accessToken, isInitialized } = useAuth();
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [approveConfirm, setApproveConfirm] = useState<any>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

  // Debug logging
  // eslint-disable-next-line no-console
  console.log('[TenantList] Render:', {
    isInitialized,
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken?.length,
    localStorage: localStorage.getItem(STORAGE_KEYS.AUTH_STORAGE) ? 'exists' : 'missing',
  });

  // Fetch tenants - only when auth is fully initialized
  const {
    data: tenants,
    isLoading,
    error: _error,
  } = useQuery({
    queryKey: ['tenants', 'pending'],
    queryFn: async () => {
      // eslint-disable-next-line no-console
      console.log('[TenantList] Making API call with token:', accessToken?.substring(0, 20) + '...');
      const response = await fetch(`${apiUrl}/tenants?status=PENDING_APPROVAL`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      // eslint-disable-next-line no-console
      console.log('[TenantList] Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        // eslint-disable-next-line no-console
        console.error('[TenantList] API Error:', errorText);
        throw new Error('Failed to fetch tenants');
      }
      return response.json();
    },
    enabled: isInitialized && !!accessToken,
  });

  // Approve tenant mutation
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
      showSuccess('Tenant approved');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (error: Error) => {
      showError('Failed to approve tenant', extractErrorMessage(error));
    },
  });

  // Reject tenant mutation
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
      showSuccess('Tenant rejected');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setRejectDialogOpen(false);
      setRejectionReason('');
    },
    onError: (error: Error) => {
      showError('Failed to reject tenant', extractErrorMessage(error));
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleApprove = (tenant: any) => {
    setApproveConfirm(null);
    approveMutation.mutate(tenant.tenantId);
  };

  const handleReject = () => {
    if (selectedTenant && rejectionReason.trim()) {
      rejectMutation.mutate({
        tenantId: selectedTenant.tenantId,
        reason: rejectionReason,
      });
    }
  };

  // Wait for auth initialization
  if (!isInitialized) {
    return <div className="text-muted-foreground">Initializing...</div>;
  }

  if (isLoading) {
    return <div className="text-muted-foreground">Loading tenants...</div>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pending Tenant Approvals</CardTitle>
        </CardHeader>
        <CardContent>
          {tenants?.length === 0 ? (
            <Alert>
              <AlertDescription className="text-foreground">No pending tenant approvals</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Subdomain</TableHead>
                    <TableHead>DOT Number</TableHead>
                    <TableHead>Fleet Size</TableHead>
                    <TableHead>Admin User</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {tenants?.map((tenant: any) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.companyName}</TableCell>
                      <TableCell>
                        <code className="text-sm bg-muted px-1 py-0.5 rounded">{tenant.subdomain}.app.example.com</code>
                      </TableCell>
                      <TableCell>{tenant.dotNumber}</TableCell>
                      <TableCell>
                        <Badge variant="muted">{tenant.fleetSize?.replace('SIZE_', '')}</Badge>
                      </TableCell>
                      <TableCell>
                        {tenant.users?.[0]?.firstName} {tenant.users?.[0]?.lastName}
                        <br />
                        <span className="text-sm text-muted-foreground">{tenant.users?.[0]?.email}</span>
                      </TableCell>
                      <TableCell>
                        {tenant.contactEmail}
                        <br />
                        <span className="text-sm text-muted-foreground">{tenant.contactPhone}</span>
                      </TableCell>
                      <TableCell>{formatTimestamp(tenant.createdAt, DISPLAY_FORMATS.FRIENDLY)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => setApproveConfirm(tenant)}
                            loading={approveMutation.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setRejectDialogOpen(true);
                            }}
                            loading={rejectMutation.isPending}
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Confirmation */}
      <AlertDialog open={!!approveConfirm} onOpenChange={(open) => !open && setApproveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Approve {approveConfirm?.companyName}? This will grant them access to the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => approveConfirm && handleApprove(approveConfirm)}>
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Tenant Registration</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting {selectedTenant?.companyName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Rejection Reason</Label>
            <Textarea
              id="reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Invalid DOT number, duplicate registration, etc."
              rows={4}
              className="bg-background"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              loading={rejectMutation.isPending}
              disabled={!rejectionReason.trim()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

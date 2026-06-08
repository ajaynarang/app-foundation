'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@app/ui/components/ui/table';
import { apiClient, api } from '@/shared/lib/api';
import { showSuccess, showError } from '@/shared/lib/toast';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Invitation {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === 'pending') {
    return (
      <Badge className="border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        Pending
      </Badge>
    );
  }
  if (lower === 'expired') {
    return (
      <Badge className="border-transparent bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        Expired
      </Badge>
    );
  }
  return <Badge variant="muted">{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function InvitationsSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Sent</TableHead>
            <TableHead className="hidden md:table-cell">Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-8 w-32 ml-auto" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function InvitationsPage() {
  const queryClient = useQueryClient();

  const { data: invitations, isLoading } = useQuery<Invitation[]>({
    queryKey: ['invitations'],
    queryFn: () => api.get('/invitations'),
  });

  // Cancel invitation
  const cancelInvitation = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/invitations/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Cancelled by admin' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showSuccess('Invitation cancelled');
    },
    onError: (e: Error) => showError('Failed to cancel invitation', extractErrorMessage(e)),
  });

  // Resend invitation
  const resendInvitation = useMutation({
    mutationFn: (id: string) => api.post(`/invitations/${id}/resend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showSuccess('Invitation resent');
    },
    onError: (e: Error) => showError('Failed to resend', extractErrorMessage(e)),
  });

  // Only show actionable invitations (pending or expired)
  const activeInvitations = useMemo(
    () =>
      invitations?.filter((inv) => {
        const status = inv.status.toLowerCase();
        return status === 'pending' || status === 'expired';
      }) ?? [],
    [invitations],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invitations</h1>
        <p className="text-muted-foreground mt-1">Pending invites, waiting on a yes</p>
      </div>

      {isLoading ? (
        <InvitationsSkeleton />
      ) : activeInvitations.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No pending invitations</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Sent</TableHead>
                <TableHead className="hidden md:table-cell">Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeInvitations.map((inv) => {
                const isPending = inv.status.toLowerCase() === 'pending';
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-foreground">
                      {inv.firstName} {inv.lastName}
                      <div className="sm:hidden text-xs text-muted-foreground font-normal">{inv.email || '--'}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{inv.email || '--'}</TableCell>
                    <TableCell>
                      <Badge variant="muted">{inv.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={resendInvitation.isPending}
                          onClick={() => resendInvitation.mutate(inv.id)}
                        >
                          Resend
                        </Button>
                        {isPending && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                            loading={cancelInvitation.isPending}
                            onClick={() => cancelInvitation.mutate(inv.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

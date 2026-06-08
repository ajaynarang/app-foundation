'use client';

import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@sally/ui/components/ui/table';
import { useInvitations, useCancelInvitation, useResendInvitation } from '../../../../hooks/use-team';

function SkeletonTable() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
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

export default function InvitationsPage() {
  const { data: invitations, isLoading } = useInvitations();
  const cancelInvitation = useCancelInvitation();
  const resendInvitation = useResendInvitation();

  // Only show actionable invitations (pending or expired), not completed/accepted
  const activeInvitations = invitations?.filter((inv) => {
    const status = inv.status.toLowerCase();
    return status === 'pending' || status === 'expired';
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invitations</h1>
        <p className="text-muted-foreground mt-1">Track and manage pending team invitations</p>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : !activeInvitations || activeInvitations.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No pending invitations</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
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
                    </TableCell>
                    <TableCell className="text-muted-foreground">{inv.email || '--'}</TableCell>
                    <TableCell>
                      <Badge variant="muted">{inv.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
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

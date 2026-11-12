'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CursorList } from '@app/shared-types';
import { useCursorList } from '@appshore/web-core/shared/list';
import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageHeader,
  PageLoadingSkeleton,
  RowActions,
} from '@/shared/components/page-chrome';
import { Badge } from '@app/ui/components/ui/badge';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { variantOf } from '@app/ui';
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
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@app/ui/components/ui/table';
import { apiClient, api } from '@appshore/web-core/shared/lib/api';
import { showSuccess, showError } from '@appshore/web-core/shared/lib/toast';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { useCopyInviteLink } from '@/features/platform/settings/hooks/use-copy-invite-link';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { INVITATION_STATUS_VARIANTS } from '@/features/platform/settings/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Invitation {
  /** Public id (uuid): the one every /invitations/:invitation_id route takes. */
  invitationId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

/** What this screen lists: invitations someone can still act on. */
const ACTIONABLE_STATUSES = 'PENDING,EXPIRED';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function InvitationsPage() {
  const queryClient = useQueryClient();
  const { formatDate } = useFormatters();

  // Only actionable invitations (pending or expired). The server filters: a paged list is never filtered in the
  // browser. A cursor list, newest first; the key stays under ['invitations'] so mutations refresh it.
  const invitations = useCursorList<Invitation>({
    queryKey: ['invitations', 'list', ACTIONABLE_STATUSES],
    queryFn: (cursor) => {
      const search = new URLSearchParams({ status: ACTIONABLE_STATUSES });
      if (cursor) search.set('cursor', cursor);
      return api.get<CursorList<Invitation>>(`/invitations?${search.toString()}`);
    },
  });
  const { isLoading } = invitations;

  // Cancel invitation
  const cancelInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      apiClient(`/invitations/${invitationId}`, {
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
    mutationFn: (invitationId: string) => api.post(`/invitations/${invitationId}/resend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showSuccess('Invitation resent');
    },
    onError: (e: Error) => showError('Failed to resend', extractErrorMessage(e)),
  });

  const copyInviteLink = useCopyInviteLink();
  const [cancelling, setCancelling] = useState<Invitation | null>(null);

  const activeInvitations = invitations.items;

  return (
    <div className="space-y-6">
      <PageHeader title="Invitations" subtitle="Pending invites, waiting on a yes" />

      {isLoading ? (
        <PageLoadingSkeleton variant="table" rows={3} />
      ) : invitations.isError ? (
        <ListErrorState
          title="Couldn't load your invitations."
          error={invitations.error}
          onRetry={() => void invitations.refetch()}
          isRetrying={invitations.isRefetching}
        />
      ) : activeInvitations.length === 0 ? (
        <PageEmptyState title="No pending invitations" description="Invite someone from Members." />
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
                <TableHead className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeInvitations.map((inv) => {
                const isPending = inv.status.toLowerCase() === 'pending';
                const status = variantOf(INVITATION_STATUS_VARIANTS, inv.status);
                const name = `${inv.firstName} ${inv.lastName}`;
                return (
                  <TableRow key={inv.invitationId}>
                    <TableCell className="font-medium text-foreground">
                      {inv.firstName} {inv.lastName}
                      <div className="sm:hidden text-xs text-muted-foreground font-normal">{inv.email || '--'}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{inv.email || '--'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{inv.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(inv.createdAt)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(inv.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        primary={{
                          label: 'Resend',
                          ariaLabel: `Resend the invitation to ${name}`,
                          loading: resendInvitation.isPending && resendInvitation.variables === inv.invitationId,
                          onClick: () => resendInvitation.mutate(inv.invitationId),
                        }}
                        items={
                          isPending
                            ? [
                                {
                                  label: 'Copy link',
                                  ariaLabel: `Copy the invitation link for ${name}`,
                                  onSelect: () => copyInviteLink.mutate(inv.invitationId),
                                },
                                {
                                  label: 'Cancel invitation…',
                                  ariaLabel: `Cancel the invitation to ${name}`,
                                  destructive: true,
                                  onSelect: () => setCancelling(inv),
                                },
                              ]
                            : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {activeInvitations.length > 0 && (
        <ListFooter
          shown={activeInvitations.length}
          total={invitations.total}
          hasMore={invitations.hasMore}
          onLoadMore={invitations.loadMore}
          isLoadingMore={invitations.isLoadingMore}
          loadMoreFailed={invitations.isLoadMoreError}
        />
      )}

      <AlertDialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling
                ? `${cancelling.firstName} ${cancelling.lastName} will no longer be able to join with this link.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelling && cancelInvitation.mutate(cancelling.invitationId)}
              disabled={cancelInvitation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

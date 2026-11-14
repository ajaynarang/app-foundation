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
  RelativeTime,
  RowActions,
} from '@/shared/components/page-chrome';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
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
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { UserPlus } from 'lucide-react';
import { useAuthStore } from '@/features/auth';
import { apiClient, api } from '@appshore/web-core/shared/lib/api';
import { showSuccess, showError } from '@appshore/web-core/shared/lib/toast';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { showPlanUpgradePrompt } from '@appshore/web-core/shared/lib/plan-upgrade';
import { memberState, roleLabel } from '@/features/platform/settings/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TeamMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Invite dialog
// ---------------------------------------------------------------------------
function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isOwner = user?.role === 'OWNER';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('');

  const { mutate: invite, isPending } = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; email?: string; role: string }) =>
      api.post('/invitations', data),
    onSuccess: () => {
      showSuccess('Invitation sent');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFirstName('');
      setLastName('');
      setEmail('');
      setRole('');
      onOpenChange(false);
    },
    onError: (err: Error) => {
      // A full plan (USER_LIMIT_REACHED) gets the upgrade prompt, not a plain failure.
      if (showPlanUpgradePrompt(err)) return;
      showError('Failed to send invitation', extractErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !role) return;
    invite({ firstName, lastName, email: email || undefined, role });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Staff Member</DialogTitle>
          <DialogDescription>Send an invitation to join your team as staff</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="invite-firstName">First Name</Label>
                <Input
                  id="invite-firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-background"
                  required
                />
              </div>
              <div>
                <Label htmlFor="invite-lastName">Last Name</Label>
                <Input
                  id="invite-lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-background"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background"
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="ADMIN">Admin</SelectItem>}
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
              {!isOwner && (
                <p className="text-sm text-muted-foreground mt-1">Only the tenant owner can invite admin users</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">Members can be managed from this page once invited</p>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending} disabled={!firstName || !lastName || !role}>
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MembersPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'deactivate' | 'activate';
    userId: string;
    name: string;
  } | null>(null);

  // A cursor list, newest first: "Load more" appends. The key stays under ['users'] so mutations refresh it.
  const members = useCursorList<TeamMember>({
    queryKey: ['users', 'list'],
    queryFn: (cursor) =>
      api.get<CursorList<TeamMember>>(cursor ? `/users?cursor=${encodeURIComponent(cursor)}` : '/users'),
  });
  const { items: users, isLoading } = members;

  // Deactivate user
  const { mutate: deactivateUser, isPending: deactivating } = useMutation({
    mutationFn: (userId: string) => apiClient(`/users/${userId}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      showSuccess('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => showError('Failed to deactivate user', extractErrorMessage(e)),
  });

  // Activate user
  const { mutate: activateUser, isPending: activating } = useMutation({
    mutationFn: (userId: string) => apiClient(`/users/${userId}/activate`, { method: 'POST' }),
    onSuccess: () => {
      showSuccess('User activated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => {
      if (showPlanUpgradePrompt(e)) return;
      showError('Failed to activate user', extractErrorMessage(e));
    },
  });

  // All team members
  const staffUsers = users;

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'deactivate') {
      deactivateUser(confirmAction.userId);
    } else {
      activateUser(confirmAction.userId);
    }
    setConfirmAction(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        subtitle="Who's on your team and what they can do"
        actions={
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Invite Staff Member</span>
          </Button>
        }
      />

      {isLoading ? (
        <PageLoadingSkeleton variant="table" rows={4} />
      ) : members.isError ? (
        <ListErrorState
          title="Couldn't load your team."
          error={members.error}
          onRetry={() => void members.refetch()}
          isRetrying={members.isRefetching}
        />
      ) : staffUsers.length === 0 ? (
        <PageEmptyState title="No team members yet" description="Invite someone to get started." />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Last Login</TableHead>
                <TableHead className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffUsers.map((member) => {
                const isCurrentUser = member.userId === user?.userId;
                const isOwner = member.role === 'OWNER';
                const isAdmin = member.role === 'ADMIN';
                const canManage = user?.role === 'OWNER' || (user?.role === 'ADMIN' && !isAdmin && !isOwner);
                const memberName = `${member.firstName} ${member.lastName}`;
                const state = memberState(member.isActive);

                return (
                  <TableRow key={member.userId}>
                    <TableCell className="font-medium text-foreground">
                      {memberName}
                      {isOwner && <span className="ml-2 text-xs text-muted-foreground">(Owner)</span>}
                      <div className="sm:hidden text-xs text-muted-foreground font-normal">{member.email}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{roleLabel(member.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {member.lastLoginAt ? <RelativeTime iso={member.lastLoginAt} /> : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      {isOwner ? (
                        <span className="text-xs text-muted-foreground">Protected</span>
                      ) : canManage ? (
                        <RowActions
                          items={[
                            member.isActive
                              ? {
                                  label: 'Deactivate…',
                                  ariaLabel: `Deactivate ${memberName}`,
                                  destructive: true,
                                  disabled: isCurrentUser,
                                  disabledReason: isCurrentUser ? 'You cannot deactivate yourself.' : undefined,
                                  onSelect: () =>
                                    setConfirmAction({ type: 'deactivate', userId: member.userId, name: memberName }),
                                }
                              : {
                                  label: 'Activate…',
                                  ariaLabel: `Activate ${memberName}`,
                                  onSelect: () =>
                                    setConfirmAction({ type: 'activate', userId: member.userId, name: memberName }),
                                },
                          ]}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {members.items.length > 0 && (
        <ListFooter
          shown={members.items.length}
          total={members.total}
          hasMore={members.hasMore}
          onLoadMore={members.loadMore}
          isLoadingMore={members.isLoadingMore}
          loadMoreFailed={members.isLoadMoreError}
        />
      )}

      {/* Invite dialog */}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {/* Confirm action dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'deactivate' ? 'Deactivate User' : 'Activate User'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'deactivate'
                ? `Deactivate ${confirmAction.name}? They will no longer be able to access the system.`
                : `Activate ${confirmAction?.name}? They will regain access to the system.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={deactivating || activating}
              className={
                confirmAction?.type === 'deactivate'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {confirmAction?.type === 'deactivate' ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

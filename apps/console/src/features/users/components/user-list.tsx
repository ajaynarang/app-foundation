'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@app/ui/components/ui/card';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/ui/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
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
import { useAuth } from '@/features/auth';
import { apiClient } from '@/lib/api-client';
import { showSuccess, showError } from '@app/ui';
import { useFormatters, DISPLAY_FORMATS } from '@/shared/lib/formatters';
import { UserPlus, Copy } from 'lucide-react';

interface UserListProps {
  onInviteClick: () => void;
  defaultTab?: string;
}

interface UserRecord {
  userId: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: string;
  status?: string;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

interface InvitationRecord {
  invitationId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  invitedByName?: string;
  invitedByUser?: { firstName: string; lastName: string };
  createdAt: string;
  expiresAt: string;
}

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return 'default' as const;
    default:
      return 'muted' as const;
  }
};

const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffDays > 30) return `${Math.floor(diffDays / 30)}mo ago`;
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return 'Just now';
};

const formatCountdown = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMs < 0) return 'Expired';
  if (diffDays > 1) return `${diffDays} days`;
  if (diffDays === 1) return '1 day';
  if (diffHours > 0) return `${diffHours}h`;
  return 'Less than 1h';
};

const isExpiryWarning = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < 2;
};

export function UserList({ onInviteClick, defaultTab = 'members' }: UserListProps) {
  const { formatTimestamp } = useFormatters();
  const { user: currentUser, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel-invitation' | 'deactivate-user' | 'activate-user';
    id: string;
    name: string;
  } | null>(null);

  // Fetch users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient<UserRecord[]>('/users'),
  });

  // Fetch invitations
  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => apiClient<InvitationRecord[]>('/invitations'),
  });

  // Cancel invitation mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return apiClient(`/invitations/${invitationId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Cancelled by admin' }),
      });
    },
    onSuccess: () => {
      showSuccess('Invitation cancelled');
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (error: Error) => {
      showError('Failed to cancel invitation', error.message);
    },
  });

  // Resend invitation mutation
  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return apiClient(`/invitations/${invitationId}/resend`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      showSuccess('Invitation resent');
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (error: Error) => {
      showError('Failed to resend invitation', error.message);
    },
  });

  // Deactivate user mutation
  const deactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiClient(`/users/${userId}/deactivate`, { method: 'POST' });
    },
    onSuccess: () => {
      showSuccess('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => {
      showError('Failed to deactivate user', error.message);
    },
  });

  // Activate user mutation
  const activateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiClient(`/users/${userId}/activate`, { method: 'POST' });
    },
    onSuccess: () => {
      showSuccess('User activated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => {
      showError('Failed to activate user', error.message);
    },
  });

  const handleCancelInvitation = (invitationId: string) => {
    setConfirmAction({ type: 'cancel-invitation', id: invitationId, name: '' });
  };

  const handleResendInvitation = (invitationId: string) => {
    resendInvitationMutation.mutate(invitationId);
  };

  const handleCopyLink = async (invitationId: string) => {
    try {
      const data = await apiClient<{ inviteLink: string }>(`/invitations/${invitationId}/link`);
      await navigator.clipboard.writeText(data.inviteLink);
      showSuccess('Link copied');
    } catch (error) {
      showError('Failed to copy link', error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeactivateUser = (userId: string, userName: string) => {
    setConfirmAction({ type: 'deactivate-user', id: userId, name: userName });
  };

  const handleActivateUser = (userId: string, userName: string) => {
    setConfirmAction({ type: 'activate-user', id: userId, name: userName });
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case 'cancel-invitation':
        cancelInvitationMutation.mutate(confirmAction.id);
        break;
      case 'deactivate-user':
        deactivateUserMutation.mutate(confirmAction.id);
        break;
      case 'activate-user':
        activateUserMutation.mutate(confirmAction.id);
        break;
    }
    setConfirmAction(null);
  };

  const getConfirmDialogContent = () => {
    if (!confirmAction) return { title: '', description: '', action: '' };
    switch (confirmAction.type) {
      case 'cancel-invitation':
        return {
          title: 'Cancel Invitation',
          description: 'Are you sure you want to cancel this invitation?',
          action: 'Cancel Invitation',
        };
      case 'deactivate-user':
        return {
          title: 'Deactivate User',
          description: `Deactivate ${confirmAction.name}? They will no longer be able to access the system.`,
          action: 'Deactivate',
        };
      case 'activate-user':
        return {
          title: 'Activate User',
          description: `Activate ${confirmAction.name}? They will regain access to the system.`,
          action: 'Activate',
        };
    }
  };

  const memberUsers = users || [];
  const pendingInvitations = invitations?.filter((i) => i.status === 'PENDING') || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle></CardTitle>
          {!isSuperAdmin && (
            <Button onClick={onInviteClick} size="sm">
              <UserPlus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Invite Member</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="members" className="text-xs sm:text-sm">
              Members ({memberUsers.length})
            </TabsTrigger>
            <TabsTrigger value="invitations" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Invitations</span>
              <span className="sm:hidden">Invites</span> ({pendingInvitations.length})
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="mt-4">
            {usersLoading ? (
              <div className="text-muted-foreground">Loading members...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Last Login</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberUsers.map((user) => {
                      const isCurrentUser = user.userId === currentUser?.userId;
                      const isOwner = user.role === 'OWNER';
                      const isAdmin = user.role === 'ADMIN';
                      const canManage = currentUser?.role === 'OWNER' || (currentUser?.role === 'ADMIN' && !isAdmin);
                      const userName = `${user.firstName} ${user.lastName}`;
                      return (
                        <TableRow key={user.userId}>
                          <TableCell className="font-medium">
                            {userName}
                            {isOwner && <span className="ml-2 text-xs text-muted-foreground">(Owner)</span>}
                            <div className="sm:hidden text-xs text-muted-foreground font-normal">{user.email}</div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={getRoleBadgeVariant(user.role)}>{user.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.isActive ? 'default' : 'muted'}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {user.lastLoginAt ? formatTimestamp(user.lastLoginAt, DISPLAY_FORMATS.FRIENDLY) : 'Never'}
                          </TableCell>
                          <TableCell>
                            {isOwner ? (
                              <span className="text-xs text-muted-foreground">Protected</span>
                            ) : !canManage ? (
                              <span className="text-xs text-muted-foreground">No Permission</span>
                            ) : (
                              <div className="flex gap-2">
                                {user.isActive ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeactivateUser(user.userId, userName)}
                                    loading={deactivateUserMutation.isPending}
                                    disabled={isCurrentUser}
                                  >
                                    Deactivate
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleActivateUser(user.userId, userName)}
                                    loading={activateUserMutation.isPending}
                                  >
                                    Activate
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {memberUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No members found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Invitations Tab */}
          <TabsContent value="invitations" className="mt-4">
            {invitationsLoading ? (
              <div className="text-muted-foreground">Loading invitations...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden lg:table-cell">Invited By</TableHead>
                      <TableHead className="hidden md:table-cell">Sent</TableHead>
                      <TableHead className="hidden md:table-cell">Expires</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map((invitation) => (
                      <TableRow key={invitation.invitationId}>
                        <TableCell className="font-medium">
                          {invitation.firstName} {invitation.lastName}
                          <div className="sm:hidden text-xs text-muted-foreground font-normal">{invitation.email}</div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{invitation.email}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(invitation.role)}>{invitation.role}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {invitation.invitedByUser?.firstName} {invitation.invitedByUser?.lastName}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {invitation.createdAt ? formatRelativeTime(invitation.createdAt) : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span
                            className={
                              isExpiryWarning(invitation.expiresAt)
                                ? 'text-yellow-600 dark:text-yellow-400 font-medium'
                                : ''
                            }
                          >
                            {formatCountdown(invitation.expiresAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 sm:gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleCopyLink(invitation.invitationId)}>
                              <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
                              <span className="hidden sm:inline">Copy Link</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResendInvitation(invitation.invitationId)}
                              loading={resendInvitationMutation.isPending}
                            >
                              Resend
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleCancelInvitation(invitation.invitationId)}
                              loading={cancelInvitationMutation.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingInvitations.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No pending invitations
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getConfirmDialogContent().title}</AlertDialogTitle>
            <AlertDialogDescription>{getConfirmDialogContent().description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={confirmAction?.type === 'deactivate-user' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {getConfirmDialogContent().action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default UserList;

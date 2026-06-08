'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
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
import { apiClient, api } from '@/shared/lib/api';
import { showSuccess, showError } from '@/shared/lib/toast';
import { extractErrorMessage } from '@/shared/lib/error-utils';

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
// Helpers
// ---------------------------------------------------------------------------
function getRoleBadgeVariant(role: string) {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return 'default' as const;
    case 'DISPATCHER':
      return 'muted' as const;
    case 'DRIVER':
      return 'outline' as const;
    default:
      return 'muted' as const;
  }
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function MembersSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card">
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
          {Array.from({ length: 4 }).map((_, i) => (
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
              <TableCell>
                <Skeleton className="h-8 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
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
                  <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                </SelectContent>
              </Select>
              {!isOwner && (
                <p className="text-sm text-muted-foreground mt-1">Only the tenant owner can invite admin users</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">To add drivers, use Fleet Management</p>
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

  const { data: users, isLoading } = useQuery<TeamMember[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
  });

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
    onError: (e: Error) => showError('Failed to activate user', extractErrorMessage(e)),
  });

  // Filter to staff only (non-drivers)
  const staffUsers = useMemo(() => users?.filter((u) => u.role !== 'DRIVER') ?? [], [users]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Members</h1>
          <p className="text-muted-foreground mt-1 text-sm">Who&apos;s on your team and what they can do</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} size="sm">
          <UserPlus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Invite Staff Member</span>
        </Button>
      </div>

      {isLoading ? (
        <MembersSkeleton />
      ) : staffUsers.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No team members found</p>
          </CardContent>
        </Card>
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffUsers.map((member) => {
                const isCurrentUser = member.userId === user?.userId;
                const isOwner = member.role === 'OWNER';
                const isAdmin = member.role === 'ADMIN';
                const canManage = user?.role === 'OWNER' || (user?.role === 'ADMIN' && !isAdmin && !isOwner);
                const memberName = `${member.firstName} ${member.lastName}`;

                return (
                  <TableRow key={member.userId}>
                    <TableCell className="font-medium text-foreground">
                      {memberName}
                      {isOwner && <span className="ml-2 text-xs text-muted-foreground">(Owner)</span>}
                      <div className="sm:hidden text-xs text-muted-foreground font-normal">{member.email}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(member.role)}>{member.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.isActive ? 'default' : 'muted'}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {member.lastLoginAt ? formatRelativeTime(member.lastLoginAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      {isOwner ? (
                        <span className="text-xs text-muted-foreground">Protected</span>
                      ) : !canManage ? (
                        <span className="text-xs text-muted-foreground">--</span>
                      ) : member.isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirmAction({
                              type: 'deactivate',
                              userId: member.userId,
                              name: memberName,
                            })
                          }
                          loading={deactivating}
                          disabled={isCurrentUser}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirmAction({
                              type: 'activate',
                              userId: member.userId,
                              name: memberName,
                            })
                          }
                          loading={activating}
                        >
                          Activate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { useAuth } from '@/features/auth';
import { apiClient } from '@/shared/lib/api';
import { showSuccess, showError } from '@app/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address').optional().or(z.literal('')),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.enum(['ADMIN', 'MEMBER']),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Only OWNER can invite ADMIN users
  const isOwner = user?.role === 'OWNER';

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: standardSchemaResolver(inviteSchema),
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      return apiClient('/invitations', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      showSuccess('Invitation sent');
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      reset();
      onOpenChange(false);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      showError('Failed to send invitation', extractErrorMessage(err));
      setError(err.message || 'Failed to send invitation');
    },
  });

  const onSubmit = (data: InviteFormData) => {
    setError(null);
    inviteMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Staff Member</DialogTitle>
          <DialogDescription>Send an invitation to join your team as staff</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" {...register('firstName')} className="bg-background" />
                {errors.firstName && (
                  <p className="text-sm text-red-500 dark:text-red-400 mt-1">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" {...register('lastName')} className="bg-background" />
                {errors.lastName && (
                  <p className="text-sm text-red-500 dark:text-red-400 mt-1">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} className="bg-background" />
              {errors.email && <p className="text-sm text-red-500 dark:text-red-400 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Select onValueChange={(value) => setValue('role', value as any)}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="ADMIN">Admin</SelectItem>}
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && <p className="text-sm text-red-500 dark:text-red-400 mt-1">{errors.role.message}</p>}
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
            <Button type="submit" loading={inviteMutation.isPending}>
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default InviteUserDialog;

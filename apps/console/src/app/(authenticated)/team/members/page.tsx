'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserList } from '@/features/users/components/user-list';
import { InviteUserDialog } from '@/features/users/components/invite-user-dialog';

export default function TeamPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'staff';
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Team</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">
          Manage staff, view drivers, and track invitations
        </p>
      </div>

      <UserList onInviteClick={() => setInviteDialogOpen(true)} defaultTab={initialTab} />
      <InviteUserDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
    </div>
  );
}

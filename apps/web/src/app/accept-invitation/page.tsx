'use client';

import { Suspense } from 'react';
import { AcceptInvitationForm } from '@/features/auth';

export default function AcceptInvitationPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Suspense fallback={<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground" />}>
        <AcceptInvitationForm />
      </Suspense>
    </div>
  );
}

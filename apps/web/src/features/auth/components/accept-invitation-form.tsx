'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { useAuthStore } from '@/features/auth';
import { PhoneAcceptanceFlow } from './accept-invitation/phone-acceptance-flow';
import { CreateAccountPanel, SignInPanel } from './accept-invitation/create-account-panel';
import { JoinPanel } from './accept-invitation/join-panel';
import type { InvitationDetails } from './accept-invitation/types';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

/**
 * The acceptance page. An invitation creates a NEW account, or an existing account joins it signed in; a token alone
 * never attaches an existing account (ADR-0009, "Workspace membership"). So: signed out, the person creates an
 * account (or signs in to accept); signed in, they join as the account they are signed in to. SMS invitations keep
 * the OTP and PIN flow. No Firebase here: a product that uses Firebase calls the API with `firebaseIdToken`.
 */
export function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { isAuthenticated, _hasHydrated } = useAuthStore();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'sign-in'>('create');

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    async function fetchInvitation() {
      try {
        // The token goes in the body, never the path, so it stays out of request logs.
        const response = await fetch(`${apiUrl}/invitations/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to load invitation');
        }
        setInvitation(await response.json());
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load invitation');
      } finally {
        setLoading(false);
      }
    }

    fetchInvitation();
  }, [token]);

  // Until the persisted session is read, signed in or out is unknown: show neither path.
  if (loading || !_hasHydrated) {
    return (
      <Card className="w-full max-w-md" data-testid="accept-invitation-loading">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!invitation || !token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invalid Invitation</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error ?? 'Invalid invitation link'}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push('/login')} className="w-full mt-4" variant="outline">
            Go to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (invitation.inviteChannel === 'SMS') {
    return <PhoneAcceptanceFlow invitation={invitation} token={token} />;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{isAuthenticated ? 'Join the workspace' : 'Create your account'}</CardTitle>
        <CardDescription>
          You&apos;ve been invited to join <strong>{invitation.tenant.companyName}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Invited by:</span>{' '}
            <span className="font-medium">
              {invitation.invitedBy.firstName} {invitation.invitedBy.lastName}
            </span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Email:</span>{' '}
            <span className="font-medium">{invitation.email}</span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Role:</span> <span className="font-medium">{invitation.role}</span>
          </p>
        </div>

        {isAuthenticated ? (
          <JoinPanel invitation={invitation} token={token} />
        ) : mode === 'sign-in' ? (
          <SignInPanel token={token} />
        ) : (
          <CreateAccountPanel invitation={invitation} token={token} onSignInRequired={() => setMode('sign-in')} />
        )}
      </CardContent>
    </Card>
  );
}

export default AcceptInvitationForm;

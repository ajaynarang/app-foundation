'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthErrorCode } from '@app/shared-types';
import { Button } from '@app/ui/components/ui/button';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { ApiError } from '@appshore/web-core/shared/lib/api';
import { showError, showSuccess } from '@appshore/web-core/shared/lib/toast';
import { useAuthStore } from '@/features/auth';
import { workspacesApi } from '@/features/platform/workspaces/api';
import { authApi } from '../../api';
import { goToWorkspace, type InvitationDetails } from './types';

type JoinProblem = 'mismatch' | 'unverified' | 'other' | null;

/**
 * Signed in: the account joins the invitation's workspace (`POST /invitations/join`), then switches to it. The
 * backend checks that the account's verified email is the invitation's; this page explains each refusal.
 */
export function JoinPanel({ invitation, token }: { invitation: InvitationDetails; token: string }) {
  const router = useRouter();
  const { user, setTokens, setUser, signOut } = useAuthStore();
  const [joining, setJoining] = useState(false);
  const [resending, setResending] = useState(false);
  const [problem, setProblem] = useState<JoinProblem>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const handleJoin = async () => {
    setJoining(true);
    setProblem(null);
    try {
      const joined = await authApi.joinInvitation(token);
      const switched = await workspacesApi.switch(joined.workspace.tenantId);
      setTokens(switched.accessToken);
      const profile = await authApi.getProfile();
      setUser(profile as Parameters<typeof setUser>[0]);
      showSuccess(`You joined ${joined.workspace.name}`);
      goToWorkspace(invitation.tenant.subdomain, { accessToken: switched.accessToken, user: profile }, router.push);
    } catch (err) {
      setJoining(false);
      const code = err instanceof ApiError ? err.data?.code : undefined;
      setProblem(
        code === AuthErrorCode.INVITATION_EMAIL_MISMATCH
          ? 'mismatch'
          : code === AuthErrorCode.EMAIL_NOT_VERIFIED
            ? 'unverified'
            : 'other',
      );
      setDetail(err instanceof ApiError ? (err.data?.detail ?? null) : null);
      showError('Could not join the workspace');
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.resendVerification();
      showSuccess('Verification email sent');
    } catch (err) {
      showError(
        err instanceof ApiError && err.status === 429
          ? 'Wait a minute before asking again'
          : 'Could not send the verification email. Please try again.',
      );
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    showSuccess('Signed out');
    // The page re-renders signed out, with the create-account and sign-in paths.
  };

  return (
    <div className="space-y-4">
      {problem === 'mismatch' && (
        <Alert variant="destructive">
          <AlertDescription>
            Signed in as {user?.email}. This invitation is for {invitation.email}.
          </AlertDescription>
        </Alert>
      )}
      {problem === 'unverified' && (
        <Alert>
          <AlertDescription>Check your inbox, then come back to this page.</AlertDescription>
        </Alert>
      )}
      {problem === 'other' && (
        <Alert variant="destructive">
          <AlertDescription>{detail || 'Could not join the workspace. Please try again.'}</AlertDescription>
        </Alert>
      )}

      {problem === 'mismatch' ? (
        <Button className="w-full" variant="outline" onClick={handleSignOut}>
          Sign out and continue
        </Button>
      ) : problem === 'unverified' ? (
        <Button className="w-full" onClick={handleResend} loading={resending} disabled={resending}>
          Resend verification email
        </Button>
      ) : (
        <Button className="w-full" onClick={handleJoin} loading={joining} disabled={joining}>
          Join {invitation.tenant.companyName} as {invitation.role}
        </Button>
      )}
    </div>
  );
}

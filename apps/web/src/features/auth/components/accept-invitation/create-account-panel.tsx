'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthErrorCode } from '@app/shared-types';
import { Button } from '@app/ui/components/ui/button';
import { Label } from '@app/ui/components/ui/label';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { ApiError } from '@appshore/web-core/shared/lib/api';
import { showError, showSuccess } from '@appshore/web-core/shared/lib/toast';
import { useAuthStore } from '@/features/auth';
import { authApi } from '../../api';
import { PasswordInput } from '../password-input';
import { goToWorkspace, type InvitationDetails } from './types';

/** The backend's rule for a new password (`AcceptInvitationDto`, the same as signup). */
const MIN_PASSWORD = 8;

/** `/login`, coming back to this invitation after sign-in (login keeps `redirect` to internal paths only). */
export function signInToAcceptHref(token: string): string {
  return `/login?redirect=${encodeURIComponent(`/accept-invitation?token=${token}`)}`;
}

/**
 * Signed out: a new account for the invited email. The email is fixed by the invitation; the person picks a
 * password. An email that already has an account is 409 SIGN_IN_TO_ACCEPT, and the page switches to sign-in.
 */
export function CreateAccountPanel({
  invitation,
  token,
  onSignInRequired,
}: {
  invitation: InvitationDetails;
  token: string;
  onSignInRequired: () => void;
}) {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      const session = await authApi.acceptInvitation(token, password);
      setSession(session as Parameters<typeof setSession>[0]);
      showSuccess(`Welcome to ${invitation.tenant.companyName}`);
      goToWorkspace(invitation.tenant.subdomain, session, router.push);
    } catch (err) {
      setAccepting(false);
      if (err instanceof ApiError && err.data?.code === AuthErrorCode.SIGN_IN_TO_ACCEPT) {
        showError('An account already uses this email. Sign in to accept.');
        onSignInRequired();
        return;
      }
      const detail = err instanceof ApiError ? err.data?.detail : undefined;
      setError(detail || 'Could not accept the invitation. Please try again.');
      showError('Could not accept the invitation');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="password">Create a password</Label>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`At least ${MIN_PASSWORD} characters`}
          autoComplete="new-password"
          required
          disabled={accepting}
        />
      </div>
      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          id="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          autoComplete="new-password"
          required
          disabled={accepting}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        className="w-full"
        loading={accepting}
        disabled={accepting || !password || !confirmPassword}
      >
        Create account and join
      </Button>
      <p className="text-sm text-muted-foreground text-center">
        Already have an account?{' '}
        <Link href={signInToAcceptHref(token)} className="text-primary underline-offset-4 hover:underline">
          Sign in to accept
        </Link>
      </p>
    </form>
  );
}

/** The sign-in path: an existing account accepts signed in, from its own session. */
export function SignInPanel({ token }: { token: string }) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">
        An account already uses this email. Sign in to it, and you come back here to accept the invitation.
      </p>
      <Link href={signInToAcceptHref(token)}>
        <Button className="w-full">Sign in to accept</Button>
      </Link>
    </div>
  );
}

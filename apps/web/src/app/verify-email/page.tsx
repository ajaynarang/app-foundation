'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, MailCheck } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { AuthErrorCode } from '@app/shared-types';
import { ApiError } from '@appshore/web-core/shared/lib/api';
import { showError, showSuccess } from '@appshore/web-core/shared/lib/toast';
import { useAuthStore } from '@/features/auth';
import { authApi } from '@/features/auth/api';

type PageState = 'verifying' | 'success' | 'invalid' | 'sign-in' | 'missing';

/**
 * Opens the link in a verification email. The link only works for the signed-in owner of the account (the backend
 * refuses another user's token), so a signed-out visitor is sent to sign in first and comes back here.
 */
function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { isAuthenticated, _hasHydrated, setUser } = useAuthStore();
  const [pageState, setPageState] = useState<PageState>('verifying');
  const [isResending, setIsResending] = useState(false);
  // React runs effects twice in development, and a token is single use: post it once.
  const posted = useRef(false);

  const refreshProfile = useCallback(async () => {
    const me = await authApi.getProfile();
    setUser(me);
    return me;
  }, [setUser]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) {
      setPageState('missing');
      return;
    }
    if (!isAuthenticated) {
      setPageState('sign-in');
      return;
    }
    if (posted.current) return;
    posted.current = true;
    (async () => {
      try {
        await authApi.verifyEmail(token);
        await refreshProfile().catch(() => undefined);
        setPageState('success');
      } catch (err) {
        if (err instanceof ApiError && err.data?.code === AuthErrorCode.VERIFICATION_LINK_INVALID) {
          // A second tab or a double submit already used the link: the account is verified, so this is success.
          const me = await refreshProfile().catch(() => null);
          setPageState(me?.emailVerified === true ? 'success' : 'invalid');
          return;
        }
        setPageState('invalid');
      }
    })();
  }, [_hasHydrated, isAuthenticated, token, refreshProfile]);

  const handleResend = async () => {
    setIsResending(true);
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
      setIsResending(false);
    }
  };

  const loginHref = `/login?redirect=${encodeURIComponent(`/verify-email?token=${token}`)}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {pageState === 'verifying' && (
          <div className="flex flex-col items-center gap-4 py-12" data-testid="verify-email-loading">
            <Skeleton className="w-16 h-16 rounded-full" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}

        {pageState === 'success' && (
          <div className="space-y-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success-text" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Email verified</h1>
              <p className="text-muted-foreground text-sm">Your email address is confirmed.</p>
            </div>
            <Link href="/">
              <Button className="w-full h-12">Continue</Button>
            </Link>
          </div>
        )}

        {pageState === 'sign-in' && (
          <div className="space-y-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <MailCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Sign in to verify your email</h1>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                Sign in to the account this email was sent for. You come back here after signing in.
              </p>
            </div>
            <Link href={loginHref}>
              <Button className="w-full h-12">Sign in</Button>
            </Link>
          </div>
        )}

        {(pageState === 'invalid' || pageState === 'missing') && (
          <div className="space-y-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-critical/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-critical-text" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Link not valid</h1>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                This link is invalid, has expired, or belongs to another account.
              </p>
            </div>
            {isAuthenticated ? (
              <Button className="w-full h-12" onClick={handleResend} loading={isResending} disabled={isResending}>
                Resend email
              </Button>
            ) : (
              <Link href="/login">
                <Button className="w-full h-12">Sign in</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <Skeleton className="h-8 w-56" />
          </div>
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}

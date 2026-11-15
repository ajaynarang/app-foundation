'use client';

import { useEffect, useState } from 'react';
import { MailWarning, X } from 'lucide-react';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Button } from '@app/ui/components/ui/button';
import { ApiError } from '@appshore/web-core/shared/lib/api';
import { showError, showSuccess } from '@appshore/web-core/shared/lib/toast';
import { useAuthStore } from '@/features/auth';
import { authApi } from '@/features/auth/api';

/** Session-only dismissal: the banner comes back in a new tab or after the browser restarts. */
export const EMAIL_UNVERIFIED_BANNER_DISMISSED_KEY = 'email-unverified-banner-dismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(EMAIL_UNVERIFIED_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Asks a signed-in user whose email is not verified to verify it. Shown only when the profile says
 * `emailVerified === false` (a missing flag is not "unverified"; it is an older profile shape).
 */
export function EmailUnverifiedBanner() {
  const user = useAuthStore((state) => state.user);
  const [dismissed, setDismissed] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (user?.emailVerified !== false || dismissed) return null;

  const handleResend = async () => {
    setIsSending(true);
    try {
      await authApi.resendVerification();
      showSuccess('Verification email sent. Check your inbox.');
    } catch (err) {
      showError(
        err instanceof ApiError && err.status === 429
          ? 'Wait a minute before asking again'
          : 'Could not send the verification email. Please try again.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(EMAIL_UNVERIFIED_BANNER_DISMISSED_KEY, '1');
    } catch {
      // Storage blocked (private mode): the banner still hides for this page view.
    }
    setDismissed(true);
  };

  return (
    <Alert className="rounded-none border-x-0 border-t-0 border-b border-caution/20 bg-caution/10">
      <MailWarning className="h-4 w-4 text-caution-text" />
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="text-caution-text font-medium">Verify your email to join other workspaces.</span>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={handleResend} loading={isSending} disabled={isSending}>
            Resend email
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

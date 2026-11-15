'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { showError, showSuccess } from '@app/ui';
import { ApiError } from '@appshore/web-core/shared/lib/api';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { authApi } from '../api';

/**
 * The profile's email badge. Verified only when the profile says `emailVerified === true`: a missing flag is not
 * proof of the mailbox. When unverified it offers to resend the verification email.
 */
export function EmailVerificationStatus({ emailVerified }: { emailVerified?: boolean }) {
  const [resending, setResending] = useState(false);
  const isVerified = emailVerified === true;

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.resendVerification();
      showSuccess('Verification email sent. Check your inbox for the link.');
    } catch (err) {
      showError(
        'Could not send the verification email',
        err instanceof ApiError && err.status === 429 ? 'Wait a minute before asking again' : extractErrorMessage(err),
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <Badge variant="outline" className="text-xs">
        {isVerified ? (
          <>
            <CheckCircle2 className="h-3 w-3 mr-1 text-muted-foreground" />
            Verified
          </>
        ) : (
          <>
            <AlertCircle className="h-3 w-3 mr-1 text-caution-text" />
            Unverified
          </>
        )}
      </Badge>
      {!isVerified && (
        <Button variant="outline" size="sm" onClick={handleResend} loading={resending} disabled={resending}>
          Resend verification email
        </Button>
      )}
    </>
  );
}

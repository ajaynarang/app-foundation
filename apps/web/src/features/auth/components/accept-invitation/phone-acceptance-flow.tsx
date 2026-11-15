'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@app/ui/components/ui/button';
import { Label } from '@app/ui/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { showError, showSuccess } from '@appshore/web-core/shared/lib/toast';
import { useAuthStore } from '@/features/auth';
import { OtpInput } from '@/components/ui/otp-input';
import { PinInput } from '@/components/ui/pin-input';
import { authApi } from '../../api';
import { goToWorkspace, type InvitationDetails } from './types';

/** An SMS invitation: verify the code sent to the phone, set a PIN, and sign in (the refresh token is a cookie). */
export function PhoneAcceptanceFlow({ invitation, token }: { invitation: InvitationDetails; token: string }) {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const [step, setStep] = useState<'otp' | 'pin'>('otp');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = invitation.phone ?? '';

  useEffect(() => {
    if (phone) {
      authApi.sendPhoneOtp(phone).catch(() => {
        setError('Failed to send verification code. Please refresh the page to try again.');
      });
    }
  }, [phone]);

  const handleFinalSubmit = async () => {
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    if (pin.length < 4) {
      setError('PIN must be 4 digits');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await authApi.acceptPhoneInvitation(token, phone, otp, pin);
      setSession(session as Parameters<typeof setSession>[0]);
      showSuccess(`Welcome to ${invitation.tenant.companyName}`);
      goToWorkspace(invitation.tenant.subdomain, session, router.push);
    } catch {
      setError('Invalid code or PIN. Please try again.');
      showError('Could not accept the invitation');
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Set up your account</CardTitle>
        <CardDescription>
          Welcome, {invitation.firstName}! You&apos;ve been invited to join{' '}
          <strong>{invitation.tenant.companyName}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 'otp' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to <strong>{phone}</strong>
            </p>
            <OtpInput value={otp} onChange={setOtp} disabled={loading} length={6} />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button className="w-full" onClick={() => otp.length >= 4 && setStep('pin')} disabled={otp.length < 4}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Set your 4-digit PIN</Label>
              <PinInput value={pin} onChange={setPin} disabled={loading} />
            </div>
            <div>
              <Label className="mb-2 block">Confirm PIN</Label>
              <PinInput value={confirmPin} onChange={setConfirmPin} disabled={loading} />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              className="w-full"
              onClick={handleFinalSubmit}
              disabled={pin.length < 4 || confirmPin.length < 4 || loading}
            >
              {loading ? 'Setting up...' : 'Complete Setup'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

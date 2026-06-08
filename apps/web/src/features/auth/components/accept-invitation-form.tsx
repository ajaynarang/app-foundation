'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { useAuthStore } from '@/features/auth';
import { authApi } from '../api';
import { OtpInput } from '@/components/ui/otp-input';
import { PinInput } from '@/components/ui/pin-input';
import { getDefaultRouteForRole, type UserRole } from '@/shared/lib/navigation';
import { buildTenantRedirectUrl } from '@/shared/lib/tenant-url';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface InvitationDetails {
  invitationId: string;
  email?: string;
  phone?: string;
  inviteChannel?: 'EMAIL' | 'SMS';
  firstName: string;
  lastName: string;
  role: string;
  tenant: {
    tenantId: string;
    companyName: string;
    subdomain: string;
  };
  invitedByUser: {
    firstName: string;
    lastName: string;
    email?: string;
  };
  expiresAt: string;
}

// ─── Phone Invitation Acceptance Flow ────────────────────────────────────────

function PhoneAcceptanceFlow({ invitation, token }: { invitation: InvitationDetails; token: string }) {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [step, setStep] = useState<'otp' | 'pin'>('otp');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = invitation.phone ?? '';

  // Send OTP on mount
  useEffect(() => {
    if (phone) {
      authApi.sendPhoneOtp(phone).catch(() => {
        setError('Failed to send verification code. Please refresh the page to try again.');
      });
    }
  }, [phone]);

  const handleOtpContinue = () => {
    if (otp.length >= 4) setStep('pin');
  };

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
      const response = await authApi.acceptPhoneInvitation(token, phone, otp, pin);
      setTokens(response.accessToken);
      setUser(response.user);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const redirectUrl = getDefaultRouteForRole(response.user.role);
      // Redirect to tenant subdomain with auth relay (localStorage is origin-scoped)
      const subdomain = invitation.tenant.subdomain;
      if (subdomain) {
        const relayUrl = buildTenantRedirectUrl(subdomain, redirectUrl, response.accessToken, response.user);
        if (relayUrl) {
          window.location.href = relayUrl;
          return;
        }
      }
      router.push(redirectUrl);
    } catch {
      setError('Invalid code or PIN. Please try again.');
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
            <Button className="w-full" onClick={handleOtpContinue} disabled={otp.length < 4 || loading}>
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

// ─── Main Invitation Form ─────────────────────────────────────────────────────

export function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { exchangeFirebaseToken } = useAuthStore();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepting, setAccepting] = useState(false);

  // Fetch invitation details
  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    async function fetchInvitation() {
      try {
        const response = await fetch(`${apiUrl}/invitations/by-token/${token}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to load invitation');
        }

        const data = await response.json();
        setInvitation(data);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load invitation');
      } finally {
        setLoading(false);
      }
    }

    fetchInvitation();
  }, [token]);

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invitation || !token) {
      setError('Invalid invitation');
      return;
    }

    // Validate passwords
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      // Step 1: Create Firebase account
      if (!invitation.email) {
        throw new Error('Email is required for this invitation');
      }
      const userCredential = await createUserWithEmailAndPassword(auth, invitation.email, password);

      const firebaseUid = userCredential.user.uid;

      // Step 2: Accept invitation on backend
      const acceptResponse = await fetch(`${apiUrl}/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          firebaseUid,
        }),
      });

      if (!acceptResponse.ok) {
        const errorData = await acceptResponse.json();
        throw new Error(errorData.message || 'Failed to accept invitation');
      }

      // Step 3: Get Firebase token and exchange for backend JWT
      const firebaseToken = await userCredential.user.getIdToken();
      await exchangeFirebaseToken(firebaseToken);

      // Step 4: Redirect to appropriate dashboard based on role (on tenant subdomain)
      const redirectUrl = getDefaultRouteForRole(invitation.role as UserRole);
      const subdomain = invitation.tenant.subdomain;
      if (subdomain) {
        const { accessToken, user } = useAuthStore.getState();
        if (accessToken && user) {
          const relayUrl = buildTenantRedirectUrl(subdomain, redirectUrl, accessToken, user);
          if (relayUrl) {
            window.location.href = relayUrl;
            return;
          }
        }
      }
      router.push(redirectUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
      setAccepting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground" />
          </div>
          <p className="text-center text-muted-foreground mt-4">Loading invitation...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state (invalid/expired invitation)
  if (error && !invitation) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invalid Invitation</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push('/login')} className="w-full mt-4" variant="outline">
            Go to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Phone-channel invitations use OTP + PIN flow (no Firebase)
  if (invitation && invitation.inviteChannel === 'SMS' && token) {
    return <PhoneAcceptanceFlow invitation={invitation} token={token} />;
  }

  // Accept invitation form (email/password flow)
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Accept Invitation</CardTitle>
        <CardDescription>
          You&apos;ve been invited to join <strong>{invitation?.tenant.companyName}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 bg-muted rounded-lg space-y-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Invited by:</span>{' '}
            <span className="font-medium">
              {invitation?.invitedByUser.firstName} {invitation?.invitedByUser.lastName}
            </span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Email:</span>{' '}
            <span className="font-medium">{invitation?.email}</span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Role:</span> <span className="font-medium">{invitation?.role}</span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Name:</span>{' '}
            <span className="font-medium">
              {invitation?.firstName} {invitation?.lastName}
            </span>
          </p>
        </div>

        <form onSubmit={handleAcceptInvitation} className="space-y-4">
          <div>
            <Label htmlFor="password">Create Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password (min. 6 characters)"
              required
              disabled={accepting}
            />
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              disabled={accepting}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={accepting || !password || !confirmPassword}>
            {accepting ? 'Creating Account...' : 'Accept Invitation'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          By accepting, you agree to create an account with the provided email address.
        </p>
      </CardContent>
    </Card>
  );
}

export default AcceptInvitationForm;

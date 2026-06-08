'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/features/auth';
import { authApi } from '@/features/auth/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@sally/ui/components/ui/card';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { OtpInput } from '@/components/ui/otp-input';
import { PinInput } from '@/components/ui/pin-input';
import { CheckCircle2, AlertCircle, Mail, Phone, Shield } from 'lucide-react';
import { ChangePasswordDialog } from '@/features/auth/components/change-password-dialog';
import { PhoneInput } from '@sally/ui/components/ui/phone-input';
import { formatPhone } from '@/shared/lib/utils/phone';
import { showSuccess, showError } from '@sally/ui';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { extractErrorMessage } from '@/shared/lib/error-utils';

function formatRelativeTime(
  isoString: string,
  formatTimestamp: (isoString: string | null | undefined, fmt?: string) => string,
): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatTimestamp(isoString, DISPLAY_FORMATS.FRIENDLY);
}

function IdentityCard() {
  const { user, setUser } = useAuthStore();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);

  // Fix 8: Sync form state with store when user changes
  useEffect(() => {
    if (user?.firstName) setFirstName(user.firstName);
    if (user?.lastName) setLastName(user.lastName);
  }, [user?.firstName, user?.lastName]);

  const isDirty = firstName !== user?.firstName || lastName !== user?.lastName;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await authApi.updateProfile({ firstName, lastName });
      setUser(updated);
      showSuccess('Profile updated');
    } catch (err) {
      showError('Failed to save profile', extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>Your display name across the platform</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleSave} loading={saving} disabled={!isDirty || !firstName || !lastName}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function EmailCard() {
  const { user } = useAuthStore();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email & Password
        </CardTitle>
        <CardDescription>Manage your email address and password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {user?.email ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">{user.email}</span>
              <Badge variant="outline" className="text-xs">
                {user.emailVerified !== false ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1 text-muted-foreground" />
                    Verified
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1 text-caution" />
                    Unverified
                  </>
                )}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No email on file. Phone login only.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {user?.email && (
            <>
              <Button variant="outline" size="sm" disabled>
                Change Email
              </Button>
              <Button variant="outline" size="sm" onClick={() => setChangePasswordOpen(true)}>
                Change Password
              </Button>
            </>
          )}
        </div>
      </CardContent>
      {user?.email && (
        <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} userEmail={user.email} />
      )}
    </Card>
  );
}

function PhoneCard() {
  const { user } = useAuthStore();
  const [phoneStep, setPhoneStep] = useState<'idle' | 'enter' | 'otp'>('idle');
  const [pinStep, setPinStep] = useState<'idle' | 'enter'>('idle');
  const [phoneE164, setPhoneE164] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    setLoading(true);
    try {
      await authApi.addPhone(phoneE164);
      setPhoneStep('otp');
      showSuccess('Verification code sent');
    } catch (err) {
      showError('Failed to send code', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      await authApi.verifyAndAddPhone(phoneE164, otp);
      showSuccess('Phone number verified');
      setPhoneStep('idle');
      setPhoneE164('');
      setOtp('');
      const updated = await authApi.getProfile();
      useAuthStore.getState().setUser(updated);
    } catch {
      showError('Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async () => {
    setLoading(true);
    try {
      await authApi.setPin(pin);
      showSuccess('PIN updated');
      setPinStep('idle');
      setPin('');
      // Fix 1: Refresh store so hasPinSet reflects immediately
      const updated = await authApi.getProfile();
      useAuthStore.getState().setUser(updated);
    } catch {
      showError('Failed to set PIN');
    } finally {
      setLoading(false);
    }
  };

  const resetPhoneFlow = () => {
    setPhoneStep('idle');
    setPhoneE164('');
    setOtp('');
  };
  const resetPinFlow = () => {
    setPinStep('idle');
    setPin('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Phone & PIN
        </CardTitle>
        <CardDescription>Phone number for SMS login and 4-digit PIN for quick access</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Phone</span>
              {user?.phone ? (
                <>
                  <span className="text-sm text-muted-foreground">{formatPhone(user.phone)}</span>
                  <Badge variant="outline" className="text-xs">
                    {user.phoneVerified ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1 text-muted-foreground" />
                        Verified
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 mr-1 text-caution" />
                        Unverified
                      </>
                    )}
                  </Badge>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Not set</span>
              )}
            </div>
            {phoneStep === 'idle' && (
              <Button variant="outline" size="sm" onClick={() => setPhoneStep('enter')}>
                {user?.phone ? 'Change' : 'Add Phone'}
              </Button>
            )}
          </div>

          {phoneStep === 'enter' && (
            <div className="space-y-3">
              <PhoneInput value={phoneE164} onChange={(e164) => setPhoneE164(e164)} disabled={loading} />
              <div className="flex gap-2">
                <Button onClick={handleSendOtp} loading={loading} disabled={!phoneE164}>
                  Send Code
                </Button>
                <Button variant="outline" onClick={resetPhoneFlow}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {phoneStep === 'otp' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {formatPhone(phoneE164)}</p>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} length={6} />
              <div className="flex gap-2">
                <Button onClick={handleVerifyOtp} loading={loading} disabled={otp.length < 6}>
                  Verify
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPhoneStep('enter');
                    setOtp('');
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border" />

        <div id="pin-section" className="space-y-3 scroll-mt-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">PIN</span>
              <span className="text-sm text-muted-foreground">
                {user?.hasPinSet ? 'Set' : 'Not set — add for faster login'}
              </span>
            </div>
            {/* Fix 4: Show disabled button with tooltip instead of silently hiding */}
            {pinStep === 'idle' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPinStep('enter')}
                disabled={!user?.phone}
                title={!user?.phone ? 'Add a phone number first' : undefined}
              >
                {user?.hasPinSet ? 'Change PIN' : 'Set PIN'}
              </Button>
            )}
          </div>

          {pinStep === 'enter' && (
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground">Enter new 4-digit PIN</Label>
              <PinInput value={pin} onChange={setPin} disabled={loading} />
              <div className="flex gap-2">
                <Button onClick={handleSetPin} loading={loading} disabled={pin.length < 4}>
                  Save PIN
                </Button>
                <Button variant="outline" onClick={resetPinFlow}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AccountCard() {
  const { user } = useAuthStore();
  const { formatTimestamp } = useFormatters();

  const loginMethods: string[] = [];
  if (user?.email) loginMethods.push('Email');
  if (user?.phone && user?.phoneVerified) loginMethods.push('Phone');

  const roleLabel: Record<string, string> = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    DISPATCHER: 'Dispatcher',
    DRIVER: 'Driver',
    CUSTOMER: 'Customer',
    SUPER_ADMIN: 'Super Admin',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your account details and access level</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge variant="muted">{roleLabel[user?.role ?? ''] ?? user?.role}</Badge>
            </dd>
          </div>
          {user?.tenantName && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="text-foreground">{user.tenantName}</dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Login methods</dt>
            <dd className="text-foreground">
              {loginMethods.length > 0 ? loginMethods.join(' · ') : 'None configured'}
            </dd>
          </div>
          {/* Fix 3: Add Member since and Last login rows */}
          {user?.createdAt && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="text-foreground">{formatTimestamp(user.createdAt, DISPLAY_FORMATS.MONTH_YEAR)}</dd>
            </div>
          )}
          {user?.lastLoginAt && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Last login</dt>
              <dd className="text-foreground">{formatRelativeTime(user.lastLoginAt, formatTimestamp)}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">Your identity and login methods</p>
      </div>
      <IdentityCard />
      <EmailCard />
      <PhoneCard />
      <AccountCard />
    </div>
  );
}

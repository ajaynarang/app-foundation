'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { Badge } from '@sally/ui/components/ui/badge';
import { PhoneInput } from '@sally/ui/components/ui/phone-input';
import { driversApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

interface InviteDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: {
    driverId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    externalSource?: string;
  } | null;
}

export function InviteDriverDialog({ open, onOpenChange, driver }: InviteDriverDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const hasExistingEmail = !!driver?.email;
  const hasExistingPhone = !!driver?.phone;

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!driver) return;
      // Use stored values first, fall back to manually entered
      const emailToSend = driver.email || email.trim() || undefined;
      const phoneToSend = driver.phone || phone.trim() || undefined;
      return driversApi.activateAndInvite(driver.driverId, emailToSend, phoneToSend);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (data: any) => {
      showSuccess('Invitation sent');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setError(null);
      // Show invite link if returned (SMS channel or always)
      if (data?.invitation?.inviteLink || data?.inviteLink) {
        setInviteLink(data?.invitation?.inviteLink ?? data?.inviteLink);
      } else {
        onOpenChange(false);
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      showError('Failed to send invitation', extractErrorMessage(err));
      setError(err.message || 'Failed to send invitation');
    },
  });

  const handleSubmit = () => {
    const hasContact = hasExistingEmail || hasExistingPhone || email.trim() || phone.trim();
    if (!hasContact) {
      setError('Email or phone is required to send an invitation');
      return;
    }
    if (email.trim() && !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError(null);
    inviteMutation.mutate();
  };

  if (!driver) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setInviteLink(null);
          setEmail('');
          setPhone('');
        }
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite {driver.name} to SALLY</DialogTitle>
          <DialogDescription>
            {hasExistingEmail && hasExistingPhone
              ? `Invitation will be sent via email and SMS.`
              : hasExistingEmail
                ? `Invitation will be sent via email to ${driver.email}.`
                : hasExistingPhone
                  ? `Invitation will be sent via SMS to ${driver.phone}.`
                  : `Enter an email or phone number to send an invitation.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {inviteLink ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Invitation sent! Share this link via WhatsApp or copy it:</p>
              <div className="flex items-center gap-2">
                <Input value={inviteLink} readOnly className="text-xs bg-muted" />
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                  Copy
                </Button>
              </div>
              <Button className="w-full" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-md bg-muted p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-foreground">Name</span>
                  <span className="text-sm text-foreground">{driver.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-foreground">Driver ID</span>
                  <span className="text-sm font-mono text-foreground">{driver.driverId}</span>
                </div>
                {driver.email && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-foreground">Email</span>
                    <span className="text-sm text-foreground">{driver.email}</span>
                  </div>
                )}
                {driver.phone && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-foreground">Phone</span>
                    <span className="text-sm text-foreground">{driver.phone}</span>
                  </div>
                )}
                {driver.externalSource && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-foreground">Source</span>
                    <Badge variant="outline">{driver.externalSource}</Badge>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-foreground">Role</span>
                  <Badge variant="outline">Driver</Badge>
                </div>
              </div>

              {/* Only show input fields if driver has no stored contact info */}
              {!hasExistingEmail && !hasExistingPhone && (
                <>
                  <div>
                    <Label htmlFor="driver-phone">
                      Phone <span className="text-muted-foreground text-xs">(for SMS invitation)</span>
                    </Label>
                    <PhoneInput id="phone" value={phone} onChange={(e164) => setPhone(e164)} />
                  </div>
                  <div>
                    <Label htmlFor="driver-email">
                      Email <span className="text-muted-foreground text-xs">(optional if phone provided)</span>
                    </Label>
                    <Input
                      id="driver-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="driver@example.com"
                      className="bg-background mt-1"
                    />
                    {phone.trim() && !email.trim() && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Will be sent via SMS since no email provided.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {!inviteLink && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={inviteMutation.isPending}>
              Send Invitation
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default InviteDriverDialog;

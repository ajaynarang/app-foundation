'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showSuccess, showError } from '@sally/ui';
import { customersApi } from '../api';
import type { Customer, CustomerContact } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

interface InviteCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export function InviteCustomerDialog({ open, onOpenChange, customer }: InviteCustomerDialogProps) {
  const queryClient = useQueryClient();
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Fetch contacts for this customer
  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ['customers', customer?.customerId, 'contacts'],
    queryFn: () => customersApi.listContacts(customer!.customerId),
    enabled: open && !!customer?.customerId,
  });

  // Filter to contacts that have an email and are active
  const eligibleContacts = useMemo(
    () => (contacts ?? []).filter((c: CustomerContact) => c.email && c.status === 'ACTIVE'),
    [contacts],
  );

  const selectedContact = useMemo(
    () => eligibleContacts.find((c: CustomerContact) => String(c.id) === selectedContactId),
    [eligibleContacts, selectedContactId],
  );

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!customer || !selectedContact) return;
      return customersApi.invite(customer.customerId, {
        email: selectedContact.email!,
        firstName: selectedContact.firstName,
        lastName: selectedContact.lastName,
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (data: any) => {
      showSuccess('Invitation sent');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setError(null);
      if (data?.inviteLink) {
        setInviteLink(data.inviteLink);
      } else {
        resetForm();
        onOpenChange(false);
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      showError('Failed to send invitation', extractErrorMessage(err));
      setError(err.message || 'Failed to send invitation');
    },
  });

  const resetForm = () => {
    setSelectedContactId('');
    setError(null);
    setInviteLink(null);
  };

  const handleSubmit = () => {
    if (!selectedContact) {
      setError('Please select a contact');
      return;
    }
    setError(null);
    inviteMutation.mutate();
  };

  if (!customer) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite to Customer Portal</DialogTitle>
          <DialogDescription>
            {inviteLink
              ? `Invitation sent to ${customer.companyName}. Share the link below.`
              : `Send a portal invitation to a contact at ${customer.companyName}. They'll set a password and access their shipments.`}
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
              <p className="text-sm text-muted-foreground">
                An email was also sent. If it doesn&apos;t arrive, share this link directly:
              </p>
              <div className="flex items-center gap-2">
                <Input value={inviteLink} readOnly className="text-xs bg-muted" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    showSuccess('Link copied');
                  }}
                >
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
                  <span className="text-sm font-medium text-foreground">Company</span>
                  <span className="text-sm text-foreground">{customer.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-foreground">Role</span>
                  <Badge variant="muted">Customer</Badge>
                </div>
              </div>

              {contactsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : eligibleContacts.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No contacts with email addresses on file for this customer. Add a contact first from the customer
                    detail view.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div>
                    <Label>Select Contact</Label>
                    <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose a contact to invite..." />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleContacts.map((contact: CustomerContact) => (
                          <SelectItem key={String(contact.id)} value={String(contact.id)}>
                            {contact.firstName} {contact.lastName} — {contact.email}
                            {contact.role ? ` (${contact.role})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedContact && (
                    <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                      <p className="text-foreground font-medium">
                        {selectedContact.firstName} {selectedContact.lastName}
                      </p>
                      <p className="text-muted-foreground">{selectedContact.email}</p>
                      {selectedContact.phone && <p className="text-muted-foreground">{selectedContact.phone}</p>}
                      <p className="text-xs text-muted-foreground mt-2">
                        This email will be used for login and shipment notifications.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {!inviteLink && eligibleContacts.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={inviteMutation.isPending} disabled={!selectedContact}>
              Send Invitation
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default InviteCustomerDialog;

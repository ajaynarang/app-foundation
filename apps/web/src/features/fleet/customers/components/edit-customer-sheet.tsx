'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetKeyboardHint } from '@sally/ui/components/ui/form-sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Separator } from '@sally/ui/components/ui/separator';
import { Badge } from '@sally/ui/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Star } from 'lucide-react';
import { PhoneInput } from '@sally/ui/components/ui/phone-input';
import { useUpdateCustomer, useCreateContact, useUpdateContact, useDeleteContact } from '../hooks/use-customers';
import { useFactoringCompanies } from '@/features/financials/billing/hooks/use-invoices';
import { useReferenceData } from '@/features/platform/reference-data';
import type { Customer, CustomerUpdate, CustomerContact, ContactCreate, ContactRole } from '../types';
import type { BillingPath } from '@/features/financials/billing/types';

const CUSTOMER_TYPES = [
  { value: 'BROKER', label: 'Broker' },
  { value: 'SHIPPER', label: 'Shipper' },
  { value: 'THREE_PL', label: '3PL' },
  { value: 'CARRIER', label: 'Outside Carrier' },
];

const CUSTOMER_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const PAYMENT_TERMS = [
  { value: 'none', label: 'Not set' },
  { value: 'NET_15', label: 'Net 15' },
  { value: 'NET_30', label: 'Net 30' },
  { value: 'NET_45', label: 'Net 45' },
  { value: 'NET_60', label: 'Net 60' },
  { value: 'NET_90', label: 'Net 90' },
  { value: 'COD', label: 'COD' },
  { value: 'QUICK_PAY', label: 'Quick Pay' },
];

const CONTACT_ROLES: { value: ContactRole; label: string }[] = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'CLAIMS', label: 'Claims' },
  { value: 'AFTER_HOURS', label: 'After Hours' },
  { value: 'OTHER', label: 'Other' },
];

interface EditCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
}

export function EditCustomerSheet({ open, onOpenChange, customer }: EditCustomerSheetProps) {
  const updateCustomer = useUpdateCustomer();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { data: refData } = useReferenceData(['us_state']);
  const { data: factoringCompanies } = useFactoringCompanies();

  const usStates = refData?.us_state || [];

  const [formData, setFormData] = useState<CustomerUpdate>({});
  const [error, setError] = useState<string | null>(null);

  // Contact form state
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [contactForm, setContactForm] = useState<ContactCreate>({
    firstName: '',
    lastName: '',
    role: 'OTHER' as ContactRole,
    email: '',
    phone: '',
    title: '',
  });
  const [contactError, setContactError] = useState<string | null>(null);
  const [deleteConfirmContact, setDeleteConfirmContact] = useState<string | null>(null);

  useEffect(() => {
    if (customer && open) {
      setFormData({
        companyName: customer.companyName || '',
        customerType: customer.customerType || 'SHIPPER',
        status: customer.status || 'ACTIVE',
        mcNumber: customer.mcNumber || '',
        dotNumber: customer.dotNumber || '',
        paymentTerms: customer.paymentTerms || '',
        creditLimit: customer.creditLimit ?? null,
        taxId: customer.taxId || '',
        defaultBillingPath: customer.defaultBillingPath,
        defaultFactoringCompanyId: customer.defaultFactoringCompanyId ?? null,
        billingEmail: customer.billingEmail || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        billingAddress: customer.billingAddress || '',
        billingCity: customer.billingCity || '',
        billingState: customer.billingState || '',
        billingZip: customer.billingZip || '',
        notes: customer.notes || '',
      });
      setError(null);
      setShowContactForm(false);
      setEditingContact(null);
    }
  }, [customer, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName?.trim()) {
      setError('Company name is required');
      return;
    }
    setError(null);
    try {
      // Convert 'none' payment terms back to empty string
      const submitData = {
        ...formData,
        paymentTerms: (formData.paymentTerms as string) === 'none' ? '' : formData.paymentTerms,
      };
      await updateCustomer.mutateAsync({
        customerId: customer.customerId,
        data: submitData,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update customer');
    }
  };

  const handleContactSubmit = async () => {
    if (!contactForm.firstName.trim() || !contactForm.lastName.trim()) {
      setContactError('First and last name are required');
      return;
    }
    setContactError(null);
    try {
      if (editingContact) {
        await updateContact.mutateAsync({
          customerId: customer.customerId,
          contactId: editingContact.contactId,
          data: contactForm,
        });
      } else {
        await createContact.mutateAsync({
          customerId: customer.customerId,
          data: contactForm,
        });
      }
      setShowContactForm(false);
      setEditingContact(null);
      setContactForm({ firstName: '', lastName: '', role: 'OTHER' as ContactRole, email: '', phone: '', title: '' });
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Failed to save contact');
    }
  };

  const handleEditContact = (contact: CustomerContact) => {
    setEditingContact(contact);
    setContactForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      role: contact.role,
      email: contact.email || '',
      phone: contact.phone || '',
      title: contact.title || '',
      isPrimary: contact.isPrimary,
    });
    setShowContactForm(true);
    setContactError(null);
  };

  const handleDeleteContact = async (contactId: string) => {
    setDeleteConfirmContact(null);
    try {
      await deleteContact.mutateAsync({
        customerId: customer.customerId,
        contactId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete contact');
    }
  };

  const contacts = customer.contacts || [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-6 overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          pinnable
          resizable
          defaultPinned
        >
          <SheetHeader>
            <SheetTitle>Edit Customer</SheetTitle>
          </SheetHeader>
          <SheetKeyboardHint />

          <div className="mt-6">
            <form id="edit-customer-form" onSubmit={handleSubmit} className="space-y-4 pb-4">
              {/* Section 1: Company Information */}
              <div>
                <Label htmlFor="edit-company-name">Company Name *</Label>
                <Input
                  id="edit-company-name"
                  value={formData.companyName || ''}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="bg-background mt-1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-customer-type">Customer Type</Label>
                  <Select
                    value={formData.customerType || 'SHIPPER'}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onValueChange={(v) => setFormData({ ...formData, customerType: v as any })}
                  >
                    <SelectTrigger className="bg-background mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={formData.status || 'ACTIVE'}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onValueChange={(v) => setFormData({ ...formData, status: v as any })}
                  >
                    <SelectTrigger className="bg-background mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-mc">MC Number</Label>
                  <Input
                    id="edit-mc"
                    value={formData.mcNumber || ''}
                    onChange={(e) => setFormData({ ...formData, mcNumber: e.target.value })}
                    placeholder="MC-123456"
                    className="bg-background mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-dot">DOT Number</Label>
                  <Input
                    id="edit-dot"
                    value={formData.dotNumber || ''}
                    onChange={(e) => setFormData({ ...formData, dotNumber: e.target.value })}
                    placeholder="1234567"
                    className="bg-background mt-1"
                  />
                </div>
              </div>

              <Separator />

              {/* Section 2: Company Address */}
              <div>
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="123 Main St"
                  className="bg-background mt-1"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-city">City</Label>
                  <Input
                    id="edit-city"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="bg-background mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-state">State</Label>
                  <Select value={formData.state || ''} onValueChange={(v) => setFormData({ ...formData, state: v })}>
                    <SelectTrigger className="bg-background mt-1">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {usStates.map((s: any) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.code} — {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Section 3: Financial */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-payment-terms">Payment Terms</Label>
                  <Select
                    value={formData.paymentTerms || 'none'}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onValueChange={(v) => setFormData({ ...formData, paymentTerms: v as any })}
                  >
                    <SelectTrigger className="bg-background mt-1">
                      <SelectValue placeholder="Select terms" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-credit-limit">Credit Limit ($)</Label>
                  <Input
                    id="edit-credit-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.creditLimit ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, creditLimit: e.target.value ? Number(e.target.value) : null })
                    }
                    placeholder="50000.00"
                    className="bg-background mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-tax-id">Tax ID / EIN</Label>
                  <Input
                    id="edit-tax-id"
                    value={formData.taxId || ''}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    placeholder="12-3456789"
                    className="bg-background mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-billing-email">Billing Email</Label>
                  <Input
                    id="edit-billing-email"
                    type="email"
                    value={formData.billingEmail || ''}
                    onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })}
                    placeholder="billing@acme.com"
                    className="bg-background mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-billing-address">Billing Address</Label>
                <Input
                  id="edit-billing-address"
                  value={formData.billingAddress || ''}
                  onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                  placeholder="456 Billing Ave"
                  className="bg-background mt-1"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="edit-billing-city">Billing City</Label>
                  <Input
                    id="edit-billing-city"
                    value={formData.billingCity || ''}
                    onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                    className="bg-background mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-billing-state">Billing State</Label>
                  <Select
                    value={formData.billingState || ''}
                    onValueChange={(v) => setFormData({ ...formData, billingState: v })}
                  >
                    <SelectTrigger className="bg-background mt-1">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {usStates.map((s: any) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-billing-zip">ZIP Code</Label>
                  <Input
                    id="edit-billing-zip"
                    value={formData.billingZip || ''}
                    onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                    placeholder="75201"
                    className="bg-background mt-1"
                  />
                </div>
              </div>
              {formData.customerType !== 'CARRIER' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-billing-path">Default Billing Path</Label>
                    <Select
                      value={formData.defaultBillingPath || 'none'}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          defaultBillingPath: v === 'none' ? undefined : (v as BillingPath),
                          defaultFactoringCompanyId: v !== 'FACTORED' ? null : formData.defaultFactoringCompanyId,
                        })
                      }
                    >
                      <SelectTrigger className="bg-background mt-1">
                        <SelectValue placeholder="Use tenant default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Use tenant default</SelectItem>
                        <SelectItem value="FACTORED">Factored (override)</SelectItem>
                        <SelectItem value="DIRECT">Direct (never factor)</SelectItem>
                        <SelectItem value="AMAZON">Amazon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.defaultBillingPath === 'FACTORED' && (
                    <div>
                      <Label htmlFor="edit-factoring-company">Default Factoring Company</Label>
                      <Select
                        value={formData.defaultFactoringCompanyId ? String(formData.defaultFactoringCompanyId) : 'none'}
                        onValueChange={(v) =>
                          setFormData({
                            ...formData,
                            defaultFactoringCompanyId: v === 'none' ? null : Number(v),
                          })
                        }
                      >
                        <SelectTrigger className="bg-background mt-1">
                          <SelectValue placeholder="Select company" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {factoringCompanies?.map((c: { id: number; companyId: string; companyName: string }) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.companyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <Separator />

              {/* Section 4: Notes */}
              <div>
                <Label htmlFor="edit-notes">Internal Notes</Label>
                <Textarea
                  id="edit-notes"
                  rows={3}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Internal notes about this customer..."
                  className="bg-background mt-1"
                />
              </div>

              <Separator />

              {/* Section 5: Contacts */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base">Contacts</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingContact(null);
                      setContactForm({
                        firstName: '',
                        lastName: '',
                        role: 'OTHER' as ContactRole,
                        email: '',
                        phone: '',
                        title: '',
                      });
                      setShowContactForm(true);
                      setContactError(null);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Contact
                  </Button>
                </div>

                {contacts.length > 0 && (
                  <div className="border border-border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden sm:table-cell">Role</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contacts.map((contact) => (
                          <TableRow key={contact.contactId}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {contact.isPrimary && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                                <span className="text-foreground">
                                  {contact.firstName} {contact.lastName}
                                </span>
                              </div>
                              {contact.phone && (
                                <div className="text-xs text-muted-foreground sm:hidden">{contact.role}</div>
                              )}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge variant="outline">{contact.role.replace('_', ' ')}</Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">
                              {contact.email || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleEditContact(contact)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-critical"
                                  onClick={() => setDeleteConfirmContact(contact.contactId)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {contacts.length === 0 && !showContactForm && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No contacts yet. Add a contact to get started.
                  </p>
                )}

                {/* Inline contact form */}
                {showContactForm && (
                  <div className="border border-border rounded-md p-4 mt-3 space-y-3 bg-muted/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="contact-first">First Name *</Label>
                        <Input
                          id="contact-first"
                          value={contactForm.firstName}
                          onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                          className="bg-background mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact-last">Last Name *</Label>
                        <Input
                          id="contact-last"
                          value={contactForm.lastName}
                          onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                          className="bg-background mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="contact-role">Role</Label>
                        <Select
                          value={contactForm.role}
                          onValueChange={(v) => setContactForm({ ...contactForm, role: v as ContactRole })}
                        >
                          <SelectTrigger className="bg-background mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTACT_ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="contact-title">Title</Label>
                        <Input
                          id="contact-title"
                          value={contactForm.title || ''}
                          onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })}
                          placeholder="VP of Operations"
                          className="bg-background mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="contact-email">Email</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={contactForm.email || ''}
                          onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                          className="bg-background mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact-phone">Phone</Label>
                        <PhoneInput
                          id="contact-phone"
                          value={contactForm.phone ?? ''}
                          onChange={(e164) => setContactForm({ ...contactForm, phone: e164 })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    {contactError && <p className="text-sm text-critical">{contactError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowContactForm(false);
                          setEditingContact(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleContactSubmit}
                        loading={createContact.isPending || updateContact.isPending}
                      >
                        {editingContact ? 'Update Contact' : 'Add Contact'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-critical">{error}</p>}
            </form>
          </div>

          <div className="flex items-center gap-2 pt-6">
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-customer-form" loading={updateCustomer.isPending}>
              Save Changes
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete contact confirmation */}
      <AlertDialog open={!!deleteConfirmContact} onOpenChange={(open) => !open && setDeleteConfirmContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmContact && handleDeleteContact(deleteConfirmContact)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

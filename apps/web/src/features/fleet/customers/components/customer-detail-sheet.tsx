'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { PhoneInput } from '@sally/ui/components/ui/phone-input';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { BillingPathBadge } from '@/features/financials/billing/components/billing-path-badge';
import { NoaSection } from '@/features/financials/billing/components/noa-section';
import {
  useCustomerById,
  useUpdateCustomer,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '../hooks/use-customers';
import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import { useFactoringCompanies } from '@/features/financials/billing/hooks/use-invoices';
import { useReferenceData } from '@/features/platform/reference-data';
import { InviteCustomerDialog } from './invite-customer-dialog';
import { DeactivationDialog, ReactivationDialog } from '@/shared/components/deactivation-dialog';
import { customersApi } from '../api';
import { apiClient } from '@/shared/lib/api';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage, extractFieldErrors } from '@/shared/lib/error-utils';
import type { Customer, CustomerUpdate, CustomerContact, ContactCreate, ContactRole } from '../types';
import type { BillingPath } from '@/features/financials/billing/types';
import {
  Pencil,
  Building2,
  DollarSign,
  Users,
  FileText,
  FileSignature,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Star,
  CreditCard,
  Send,
  Plus,
  Trash2,
  MoreHorizontal,
  UserMinus,
  RotateCcw,
  AlertCircle,
  Copy,
  RefreshCw,
} from 'lucide-react';

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

const paymentTermsLabel: Record<string, string> = {
  NET_15: 'Net 15',
  NET_30: 'Net 30',
  NET_45: 'Net 45',
  NET_60: 'Net 60',
  NET_90: 'Net 90',
  COD: 'COD',
  QUICK_PAY: 'Quick Pay',
};

const statusVariant = (status: string) => {
  if (status === 'ACTIVE') return 'default' as const;
  if (status === 'INACTIVE') return 'muted' as const;
  if (status === 'SUSPENDED') return 'destructive' as const;
  return 'outline' as const;
};

const statusLabel = (status: string) => {
  if (status === 'ON_HOLD') return 'On Hold';
  return status.charAt(0) + status.slice(1).toLowerCase();
};

interface CustomerDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onMutate?: () => void;
  startEditing?: boolean;
}

export function CustomerDetailSheet({
  open,
  onOpenChange,
  customer,
  onMutate,
  startEditing,
}: CustomerDetailSheetProps) {
  const updateCustomer = useUpdateCustomer();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { data: refData } = useReferenceData(['us_state']);
  const { data: factoringCompanies } = useFactoringCompanies();
  const usStates = refData?.us_state || [];

  // Fetch full customer data (includes contacts)
  const { data: fullCustomer, isLoading: isLoadingFull } = useCustomerById(customer?.customerId ?? '');
  const data = fullCustomer ?? customer;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const startEditingInitialized = useRef(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [deactivateBlockers, setDeactivateBlockers] = useState<{ message: string; items: string[] } | null>(null);

  const [editForm, setEditForm] = useState<CustomerUpdate>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  // Reset edit state when customer changes
  useEffect(() => {
    setIsEditing(false);
    setShowContactForm(false);
    setEditingContact(null);
    startEditingInitialized.current = false;
  }, [customer?.customerId]);

  const initEditForm = useCallback(() => {
    if (!data) return;
    setEditForm({
      companyName: data.companyName || '',
      customerType: data.customerType || 'SHIPPER',
      status: data.status || 'ACTIVE',
      mcNumber: data.mcNumber || '',
      dotNumber: data.dotNumber || '',
      paymentTerms: data.paymentTerms || '',
      creditLimit: data.creditLimit ?? null,
      taxId: data.taxId || '',
      defaultBillingPath: data.defaultBillingPath,
      defaultFactoringCompanyId: data.defaultFactoringCompanyId ?? null,
      billingEmail: data.billingEmail || '',
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      billingAddress: data.billingAddress || '',
      billingCity: data.billingCity || '',
      billingState: data.billingState || '',
      billingZip: data.billingZip || '',
      notes: data.notes || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customFieldValues: ((data as any).customFieldValues ?? {}) as Record<string, string | number | null>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setShowContactForm(false);
    setEditingContact(null);
    setSaveError(null);
    setFieldErrors({});
  }, [data]);

  // Start in edit mode if requested (only once per open cycle)
  useEffect(() => {
    if (open && startEditing && data && !startEditingInitialized.current) {
      startEditingInitialized.current = true;
      initEditForm();
      setIsEditing(true);
    }
  }, [open, startEditing, data, initEditForm]);

  const handleSave = async () => {
    if (!data) return;
    if (!editForm.companyName?.trim()) {
      setSaveError('Company name is required');
      return;
    }
    setSaveError(null);
    setFieldErrors({});
    setIsSaving(true);
    try {
      const submitData: Record<string, unknown> = {
        companyName: editForm.companyName?.trim() || undefined,
        customerType: editForm.customerType || undefined,
        status: editForm.status || undefined,
        mcNumber: editForm.mcNumber?.trim() || undefined,
        dotNumber: editForm.dotNumber?.trim() || undefined,
        paymentTerms: (editForm.paymentTerms as string) === 'none' ? '' : editForm.paymentTerms || undefined,
        creditLimit: editForm.creditLimit,
        taxId: editForm.taxId?.trim() || undefined,
        defaultBillingPath: editForm.defaultBillingPath || undefined,
        defaultFactoringCompanyId: editForm.defaultFactoringCompanyId,
        billingEmail: editForm.billingEmail?.trim() || undefined,
        address: editForm.address?.trim() || undefined,
        city: editForm.city?.trim() || undefined,
        state: editForm.state?.trim() || undefined,
        billingAddress: editForm.billingAddress?.trim() || undefined,
        billingCity: editForm.billingCity?.trim() || undefined,
        billingState: editForm.billingState?.trim() || undefined,
        billingZip: editForm.billingZip?.trim() || undefined,
        notes: editForm.notes?.trim() || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((editForm as any).customFieldValues !== undefined && {
          customFieldValues: (editForm as any).customFieldValues,
        }),
      };
      // Remove undefined keys so backend doesn't get empty values
      Object.keys(submitData).forEach((k) => {
        if (submitData[k] === undefined) delete submitData[k];
      });
      await updateCustomer.mutateAsync({
        customerId: data.customerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: submitData as any,
      });
      setIsEditing(false);
      onMutate?.();
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setSaveError(`${Object.keys(fields).length} field(s) have validation errors`);
      } else {
        setSaveError(extractErrorMessage(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleContactSubmit = async () => {
    if (!data) return;
    if (!contactForm.firstName.trim() || !contactForm.lastName.trim()) {
      setContactError('First and last name are required');
      return;
    }
    setContactError(null);
    try {
      if (editingContact) {
        await updateContact.mutateAsync({
          customerId: data.customerId,
          contactId: editingContact.contactId,
          data: contactForm,
        });
      } else {
        await createContact.mutateAsync({
          customerId: data.customerId,
          data: contactForm,
        });
      }
      setShowContactForm(false);
      setEditingContact(null);
      setContactForm({ firstName: '', lastName: '', role: 'OTHER' as ContactRole, email: '', phone: '', title: '' });
    } catch {
      setContactError('Failed to save contact');
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
    if (!data) return;
    setDeleteConfirmContact(null);
    try {
      await deleteContact.mutateAsync({
        customerId: data.customerId,
        contactId,
      });
    } catch {
      // Hook handles toasts
    }
  };

  const handleDeactivate = async (reason: string) => {
    if (!data) return;
    try {
      await customersApi.deactivate(data.customerId, reason);
      setDeactivateOpen(false);
      setDeactivateBlockers(null);
      showSuccess('Customer deactivated');
      onMutate?.();
    } catch (err) {
      const e = err as {
        status?: number;
        data?: { message?: string; activeLoads?: Array<{ loadId: string; status: string }> };
      };
      if (e.status === 409) {
        const errData = e.data;
        setDeactivateBlockers({
          message: errData?.message ?? 'Cannot deactivate customer',
          items: [...(errData?.activeLoads || []).map((l) => `Load ${l.loadId} (${l.status})`)],
        });
      } else {
        showError('Failed to deactivate customer', extractErrorMessage(err));
        setDeactivateOpen(false);
      }
    }
  };

  const handleReactivate = async () => {
    if (!data) return;
    try {
      await customersApi.reactivate(data.customerId);
      setReactivateOpen(false);
      showSuccess('Customer reactivated');
      onMutate?.();
    } catch (err) {
      showError('Failed to reactivate customer', extractErrorMessage(err));
      setReactivateOpen(false);
    }
  };

  const handleCopyInviteLink = async (invitationId: string) => {
    try {
      const result = await apiClient<{ inviteLink: string }>(`/invitations/${invitationId}/link`);
      await navigator.clipboard.writeText(result.inviteLink);
      showSuccess('Link copied');
    } catch {
      showError('Failed to copy link');
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    try {
      await apiClient(`/invitations/${invitationId}/resend`, { method: 'POST' });
      showSuccess('Invitation resent');
    } catch {
      showError('Failed to resend invitation');
    }
  };

  if (!customer) return null;

  const contacts = data?.contacts || [];
  const primaryContact = contacts.find((c) => c.isPrimary);

  const viewFooterExtra = !isEditing && (
    <>
      {data && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {data.portalAccessStatus === 'INVITED' && data.pendingInvitationId && (
              <>
                <DropdownMenuItem onClick={() => handleCopyInviteLink(data.pendingInvitationId!)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Invite Link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleResendInvitation(data.pendingInvitationId!)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend Invitation
                </DropdownMenuItem>
              </>
            )}
            {data.status !== 'INACTIVE' && (
              <DropdownMenuItem className="text-critical" onClick={() => setDeactivateOpen(true)}>
                <UserMinus className="h-4 w-4 mr-2" />
                Deactivate
              </DropdownMenuItem>
            )}
            {data.status === 'INACTIVE' && (
              <DropdownMenuItem onClick={() => setReactivateOpen(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reactivate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className="flex-1" />
      {(!data?.portalAccessStatus || data.portalAccessStatus === 'NO_ACCESS') && (
        <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Invite to Portal
        </Button>
      )}
      <Button
        size="sm"
        onClick={() => {
          initEditForm();
          setIsEditing(true);
        }}
      >
        <Pencil className="h-4 w-4 mr-1" />
        Edit
      </Button>
    </>
  );

  const customerTypeLabel = data?.customerType
    ? (CUSTOMER_TYPES.find((t) => t.value === data.customerType)?.label ?? data.customerType)
    : null;

  const headerBadges = (
    <div className="flex items-center gap-2">
      {customerTypeLabel && <Badge variant="outline">{customerTypeLabel}</Badge>}
      {data?.status && <Badge variant={statusVariant(data.status)}>{statusLabel(data.status)}</Badge>}
    </div>
  );

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title={data?.companyName || 'Customer'}
        description={`Customer details for ${data?.companyName || 'customer'}`}
        mode={isEditing ? 'edit' : 'view'}
        onSubmit={handleSave}
        onCancel={() => setIsEditing(false)}
        submitLabel="Save Changes"
        isSubmitting={isSaving}
        entityType="customer"
        resizable
        headerActions={headerBadges}
        footerExtra={isEditing ? undefined : viewFooterExtra}
      >
        {isLoadingFull && !fullCustomer ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Inactive banner */}
            {data?.status === 'INACTIVE' && (
              <Alert className="mb-4 bg-muted border-border">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  This customer was deactivated
                  {data.deactivatedAt && ` on ${new Date(data.deactivatedAt).toLocaleDateString()}`}
                  {data.deactivationReason && ` — ${data.deactivationReason}`}
                </AlertDescription>
              </Alert>
            )}

            {/* Save error alert */}
            {isEditing && saveError && (
              <Alert className="mb-4 bg-destructive/10 border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-sm">
                  <span className="font-medium">{saveError}</span>
                  {Object.keys(fieldErrors).length > 0 && (
                    <ul className="mt-1 list-disc list-inside text-xs text-muted-foreground">
                      {Object.entries(fieldErrors).map(([field, msg]) => {
                        const label = field
                          .replace(/([A-Z])/g, ' $1')
                          .replace(/^./, (s) => s.toUpperCase())
                          .trim();
                        return (
                          <li key={field}>
                            <span className="font-medium">{label}</span>: {msg}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* 1. Company Information */}
            <SheetSection icon={Building2} title="Company Information">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-company-name">Company Name *</Label>
                    <Input
                      id="edit-company-name"
                      value={editForm.companyName || ''}
                      onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Customer Type</Label>
                      <Select
                        value={editForm.customerType || 'SHIPPER'}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onValueChange={(v) => setEditForm({ ...editForm, customerType: v as any })}
                      >
                        <SelectTrigger>
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
                      <Label>Status</Label>
                      <Select
                        value={editForm.status || 'ACTIVE'}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onValueChange={(v) => setEditForm({ ...editForm, status: v as any })}
                      >
                        <SelectTrigger>
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
                        value={editForm.mcNumber || ''}
                        onChange={(e) => setEditForm({ ...editForm, mcNumber: e.target.value })}
                        placeholder="MC-123456"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-dot">DOT Number</Label>
                      <Input
                        id="edit-dot"
                        value={editForm.dotNumber || ''}
                        onChange={(e) => setEditForm({ ...editForm, dotNumber: e.target.value })}
                        placeholder="1234567"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="edit-address">Address</Label>
                    <Input
                      id="edit-address"
                      value={editForm.address || ''}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-city">City</Label>
                      <Input
                        id="edit-city"
                        value={editForm.city || ''}
                        onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Select
                        value={editForm.state || ''}
                        onValueChange={(v) => setEditForm({ ...editForm, state: v })}
                      >
                        <SelectTrigger>
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
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="MC Number" value={data?.mcNumber} mono />
                  <InfoItem label="DOT Number" value={data?.dotNumber} mono />
                  <InfoItem
                    label="Address"
                    value={
                      data?.address
                        ? `${data.address}${data.city ? `, ${data.city}` : ''}${data.state ? `, ${data.state}` : ''}`
                        : undefined
                    }
                    icon={<MapPin className="h-3 w-3" />}
                  />
                  <InfoItem
                    label="Primary Contact"
                    value={primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}` : undefined}
                  />
                  <InfoItem label="Contact Phone" value={primaryContact?.phone} icon={<Phone className="h-3 w-3" />} />
                  <InfoItem label="Contact Email" value={primaryContact?.email} icon={<Mail className="h-3 w-3" />} />
                </div>
              )}
            </SheetSection>

            {/* 2. Financial */}
            <SheetSection icon={DollarSign} title="Financial">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Payment Terms</Label>
                      <Select
                        value={editForm.paymentTerms || 'none'}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onValueChange={(v) => setEditForm({ ...editForm, paymentTerms: v as any })}
                      >
                        <SelectTrigger>
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
                        value={editForm.creditLimit ?? ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, creditLimit: e.target.value ? Number(e.target.value) : null })
                        }
                        placeholder="50000.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-tax-id">Tax ID / EIN</Label>
                      <Input
                        id="edit-tax-id"
                        value={editForm.taxId || ''}
                        onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value })}
                        placeholder="12-3456789"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-billing-email">Billing Email</Label>
                      <Input
                        id="edit-billing-email"
                        type="email"
                        value={editForm.billingEmail || ''}
                        onChange={(e) => setEditForm({ ...editForm, billingEmail: e.target.value })}
                        placeholder="billing@acme.com"
                      />
                    </div>
                  </div>
                  {editForm.customerType !== 'CARRIER' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Default Billing Path</Label>
                        <Select
                          value={editForm.defaultBillingPath || 'none'}
                          onValueChange={(v) =>
                            setEditForm({
                              ...editForm,
                              defaultBillingPath: v === 'none' ? undefined : (v as BillingPath),
                              defaultFactoringCompanyId: v !== 'FACTORED' ? null : editForm.defaultFactoringCompanyId,
                            })
                          }
                        >
                          <SelectTrigger>
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
                      {editForm.defaultBillingPath === 'FACTORED' && (
                        <div>
                          <Label>Default Factoring Company</Label>
                          <Select
                            value={
                              editForm.defaultFactoringCompanyId ? String(editForm.defaultFactoringCompanyId) : 'none'
                            }
                            onValueChange={(v) =>
                              setEditForm({
                                ...editForm,
                                defaultFactoringCompanyId: v === 'none' ? null : Number(v),
                              })
                            }
                          >
                            <SelectTrigger>
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
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem
                    label="Payment Terms"
                    value={data?.paymentTerms ? paymentTermsLabel[data.paymentTerms] || data.paymentTerms : undefined}
                  />
                  <InfoItem
                    label="Credit Limit"
                    value={data?.creditLimit != null ? `$${data.creditLimit.toLocaleString()}` : undefined}
                  />
                  <InfoItem label="Tax ID / EIN" value={data?.taxId} mono />
                  <InfoItem label="Billing Email" value={data?.billingEmail} icon={<Mail className="h-3 w-3" />} />
                  {data?.customerType !== 'CARRIER' && (
                    <>
                      <div>
                        <span className="text-xs text-muted-foreground">Default Billing Path</span>
                        <div className="mt-0.5">
                          {data?.defaultBillingPath ? (
                            <BillingPathBadge billingPath={data.defaultBillingPath} />
                          ) : (
                            <span className="text-sm text-foreground">{'\u2014'}</span>
                          )}
                        </div>
                      </div>
                      {data?.defaultFactoringCompanyId && (
                        <InfoItem
                          label="Default Factoring Co."
                          value={
                            factoringCompanies?.find(
                              (c: { id: number; companyName: string }) => c.id === data.defaultFactoringCompanyId,
                            )?.companyName || `#${data.defaultFactoringCompanyId}`
                          }
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </SheetSection>

            {/* 2.5 Notice of Assignment — broker/shipper/3PL only (Phase 1 guard) */}
            {data?.customerType !== 'CARRIER' && (
              <SheetSection icon={FileSignature} title="Notice of Assignment">
                <NoaSection customerId={data?.id ?? null} customerName={data?.companyName ?? ''} />
              </SheetSection>
            )}

            {/* 3. Billing Address */}
            <SheetSection icon={CreditCard} title="Billing Address">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-billing-address">Address</Label>
                    <Input
                      id="edit-billing-address"
                      value={editForm.billingAddress || ''}
                      onChange={(e) => setEditForm({ ...editForm, billingAddress: e.target.value })}
                      placeholder="456 Billing Ave"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="edit-billing-city">City</Label>
                      <Input
                        id="edit-billing-city"
                        value={editForm.billingCity || ''}
                        onChange={(e) => setEditForm({ ...editForm, billingCity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Select
                        value={editForm.billingState || ''}
                        onValueChange={(v) => setEditForm({ ...editForm, billingState: v })}
                      >
                        <SelectTrigger>
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
                        value={editForm.billingZip || ''}
                        onChange={(e) => setEditForm({ ...editForm, billingZip: e.target.value })}
                        placeholder="75201"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Address" value={data?.billingAddress} />
                  <InfoItem label="City" value={data?.billingCity} />
                  <InfoItem label="State" value={data?.billingState} />
                  <InfoItem label="ZIP Code" value={data?.billingZip} />
                </div>
              )}
            </SheetSection>

            {/* 4. Contacts */}
            <SheetSection icon={Users} title={`Contacts${contacts.length > 0 ? ` (${contacts.length})` : ''}`}>
              {contacts.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Role</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead className="hidden md:table-cell">Phone</TableHead>
                      {isEditing && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow key={contact.contactId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {contact.isPrimary && <Star className="h-3 w-3 text-caution fill-current" />}
                            <span className="font-medium text-foreground">
                              {contact.firstName} {contact.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline">{contact.role.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-foreground">
                          {contact.email || '\u2014'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-foreground">
                          {contact.phone || '\u2014'}
                        </TableCell>
                        {isEditing && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEditContact(contact)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-critical"
                                onClick={() => setDeleteConfirmContact(contact.contactId)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {contacts.length === 0 && !isEditing && <p className="text-sm text-muted-foreground">No contacts</p>}

              {contacts.length === 0 && isEditing && !showContactForm && (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  No contacts yet. Add a contact to get started.
                </p>
              )}

              {isEditing && !showContactForm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
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
              )}

              {/* Inline contact form */}
              {isEditing && showContactForm && (
                <div className="border border-border rounded-md p-4 mt-3 space-y-3 bg-muted/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="contact-first">First Name *</Label>
                      <Input
                        id="contact-first"
                        value={contactForm.firstName}
                        onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="contact-last">Last Name *</Label>
                      <Input
                        id="contact-last"
                        value={contactForm.lastName}
                        onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Role</Label>
                      <Select
                        value={contactForm.role}
                        onValueChange={(v) => setContactForm({ ...contactForm, role: v as ContactRole })}
                      >
                        <SelectTrigger>
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
                      />
                    </div>
                    <div>
                      <Label htmlFor="contact-phone">Phone</Label>
                      <PhoneInput
                        id="contact-phone"
                        value={contactForm.phone ?? ''}
                        onChange={(e164) => setContactForm({ ...contactForm, phone: e164 })}
                      />
                    </div>
                  </div>
                  {contactError && <p className="text-sm text-critical">{contactError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button
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
                      size="sm"
                      onClick={handleContactSubmit}
                      loading={createContact.isPending || updateContact.isPending}
                    >
                      {editingContact ? 'Update Contact' : 'Add Contact'}
                    </Button>
                  </div>
                </div>
              )}
            </SheetSection>

            {/* 5. Notes */}
            <SheetSection icon={FileText} title="Notes" defaultOpen={!!data?.notes}>
              {isEditing ? (
                <div>
                  <Textarea
                    rows={3}
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Internal notes about this customer..."
                  />
                </div>
              ) : data?.notes ? (
                <p className="text-sm text-foreground whitespace-pre-wrap">{data.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes</p>
              )}
            </SheetSection>

            {/* 6. Portal Access */}
            <SheetSection icon={ExternalLink} title="Portal Access">
              <div className="flex items-center gap-3">
                {data?.portalAccessStatus === 'ACTIVE' && <Badge variant="default">Active</Badge>}
                {data?.portalAccessStatus === 'INVITED' && <Badge variant="muted">Invited</Badge>}
                {data?.portalAccessStatus === 'DEACTIVATED' && <Badge variant="destructive">Deactivated</Badge>}
                {(!data?.portalAccessStatus || data.portalAccessStatus === 'NO_ACCESS') && (
                  <Badge variant="outline">No Access</Badge>
                )}
              </div>
            </SheetSection>

            {/* 7. Custom Fields */}
            <CustomFieldsSection
              entityType="CUSTOMER"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              values={(isEditing ? (editForm as any).customFieldValues : (data as any)?.customFieldValues) ?? {}}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onChange={(values) => setEditForm((prev) => ({ ...prev, customFieldValues: values }) as any)}
              mode={isEditing ? 'edit' : 'view'}
            />
          </div>
        )}
      </FormSheet>

      {/* Invite Customer Dialog */}
      {data && <InviteCustomerDialog open={inviteOpen} onOpenChange={setInviteOpen} customer={data} />}

      {/* Deactivation / Reactivation */}
      <DeactivationDialog
        open={deactivateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateOpen(false);
            setDeactivateBlockers(null);
          }
        }}
        entityType="customer"
        entityName={data?.companyName || ''}
        onConfirm={handleDeactivate}
        blockers={deactivateBlockers}
      />
      <ReactivationDialog
        open={reactivateOpen}
        onOpenChange={(open) => {
          if (!open) setReactivateOpen(false);
        }}
        entityName={data?.companyName || ''}
        deactivatedAt={data?.deactivatedAt}
        deactivationReason={data?.deactivationReason}
        onConfirm={handleReactivate}
      />

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

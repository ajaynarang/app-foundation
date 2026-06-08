'use client';

import { useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { useCreateCustomer } from '../hooks/use-customers';
import { customersApi } from '../api';
import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import { useReferenceData } from '@/features/platform/reference-data';
import { US_STATES_FALLBACK } from '@/features/fleet/loads/components/LoadDetailPanel';
import type { CustomerCreate } from '../types';
import type { Customer } from '@sally/shared-types';

interface CreateCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the newly created customer after successful creation */
  onCreated?: (customer: Customer) => void;
}

/** Extended form type with primary contact fields (sent as a separate CustomerContact). */
type CreateCustomerForm = CustomerCreate & {
  customFieldValues?: Record<string, string | number | null>;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
};

const EMPTY_FORM: CreateCustomerForm = {
  companyName: '',
  customerType: 'SHIPPER',
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
};

export function CreateCustomerSheet({ open, onOpenChange, onCreated }: CreateCustomerSheetProps) {
  const createCustomerMutation = useCreateCustomer();
  const { data: refData } = useReferenceData();

  const [form, setForm] = useState<CreateCustomerForm>({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);

  const update = useCallback((patch: Partial<CreateCustomerForm>) => setForm((prev) => ({ ...prev, ...patch })), []);

  function resetAndClose() {
    setForm({ ...EMPTY_FORM });
    setError(null);
    onOpenChange(false);
  }

  const handleSubmit = useCallback(() => {
    if (!form.companyName.trim()) {
      setError('Company name is required');
      return;
    }
    if (form.primaryContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.primaryContactEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    if (form.primaryContactPhone && !/^[\d\s()+\-]{7,}$/.test(form.primaryContactPhone)) {
      setError('Please enter a valid phone number');
      return;
    }
    setError(null);

    // Extract contact fields — they go as a separate CustomerContact create
    const { primaryContactName, primaryContactEmail, primaryContactPhone, ...customerData } = form;

    createCustomerMutation.mutate(customerData, {
      onSuccess: async (customer) => {
        // Auto-create primary contact if contact info was provided
        if (primaryContactName?.trim()) {
          const nameParts = primaryContactName.trim().split(/\s+/);
          const firstName = nameParts[0] || 'Primary';
          const lastName = nameParts.slice(1).join(' ') || 'Contact';
          try {
            await customersApi.createContact(customer.customerId, {
              firstName,
              lastName,
              email: primaryContactEmail?.trim() || undefined,
              phone: primaryContactPhone?.trim() || undefined,
              role: 'PRIMARY',
              isPrimary: true,
            });
          } catch {
            // Non-blocking — customer was created; contact can be added later
          }
        }
        onCreated?.(customer);
        resetAndClose();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetAndClose is stable (only uses setters)
  }, [form, createCustomerMutation, onCreated]);

  const usStates =
    refData?.us_state?.map((item) => ({ code: item.code, label: item.label })) ??
    US_STATES_FALLBACK.map((s) => ({ code: s, label: s }));

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add Customer"
      description="Add a new customer to your account. You can invite them to the portal after."
      mode="edit"
      onSubmit={handleSubmit}
      onCancel={resetAndClose}
      submitLabel="Add Customer"
      isSubmitting={createCustomerMutation.isPending}
      entityType="customer"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Critical fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="new-company-name">Company Name *</Label>
            <Input
              id="new-company-name"
              value={form.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              placeholder="Acme Logistics"
              className="bg-background mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="new-customer-type">Customer Type</Label>
            <Select
              value={form.customerType || 'SHIPPER'}
              onValueChange={(v) => update({ customerType: v as CustomerCreate['customerType'] })}
            >
              <SelectTrigger className="bg-background mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SHIPPER">Shipper</SelectItem>
                <SelectItem value="BROKER">Broker</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="new-contact-name">Contact Name</Label>
          <Input
            id="new-contact-name"
            value={form.primaryContactName}
            onChange={(e) => update({ primaryContactName: e.target.value })}
            placeholder="Jane Smith"
            className="bg-background mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="new-contact-email">Email</Label>
            <Input
              id="new-contact-email"
              type="email"
              value={form.primaryContactEmail}
              onChange={(e) => update({ primaryContactEmail: e.target.value })}
              placeholder="jane@acme.com"
              className="bg-background mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-contact-phone">Phone</Label>
            <Input
              id="new-contact-phone"
              type="tel"
              value={form.primaryContactPhone}
              onChange={(e) => update({ primaryContactPhone: e.target.value })}
              placeholder="(555) 123-4567"
              className="bg-background mt-1"
            />
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border" />

        {/* More Details — collapsed by default */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group uppercase tracking-wide font-medium">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
            More Details
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            {/* MC & DOT */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">MC Number</Label>
                <Input
                  className="mt-1"
                  value={form.mcNumber || ''}
                  onChange={(e) => update({ mcNumber: e.target.value })}
                  placeholder="MC-123456"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">DOT Number</Label>
                <Input
                  className="mt-1"
                  value={form.dotNumber || ''}
                  onChange={(e) => update({ dotNumber: e.target.value })}
                  placeholder="1234567"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <Label className="text-xs text-muted-foreground">Address</Label>
              <Input
                className="mt-1"
                value={form.address || ''}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input
                  className="mt-1"
                  value={form.city || ''}
                  onChange={(e) => update({ city: e.target.value })}
                  placeholder="Dallas"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">State</Label>
                <Select value={form.state || ''} onValueChange={(v) => update({ state: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {usStates.map((st) => (
                      <SelectItem key={st.code} value={st.code}>
                        {st.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Financial */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Payment Terms</Label>
                <Select
                  value={form.paymentTerms || ''}
                  onValueChange={(v) =>
                    update({
                      paymentTerms: v as CustomerCreate['paymentTerms'],
                    })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NET_15">Net 15</SelectItem>
                    <SelectItem value="NET_30">Net 30</SelectItem>
                    <SelectItem value="NET_45">Net 45</SelectItem>
                    <SelectItem value="NET_60">Net 60</SelectItem>
                    <SelectItem value="NET_90">Net 90</SelectItem>
                    <SelectItem value="COD">COD</SelectItem>
                    <SelectItem value="QUICK_PAY">Quick Pay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Credit Limit ($)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="0"
                  value={form.creditLimit ?? ''}
                  onChange={(e) =>
                    update({
                      creditLimit: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="50000"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tax ID / EIN</Label>
                <Input
                  className="mt-1"
                  value={form.taxId || ''}
                  onChange={(e) => update({ taxId: e.target.value })}
                  placeholder="12-3456789"
                />
              </div>
            </div>

            {/* Billing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Billing Email</Label>
                <Input
                  className="mt-1"
                  type="email"
                  value={form.billingEmail || ''}
                  onChange={(e) => update({ billingEmail: e.target.value })}
                  placeholder="billing@acme.com"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Billing Address</Label>
                <Input
                  className="mt-1"
                  value={form.billingAddress || ''}
                  onChange={(e) => update({ billingAddress: e.target.value })}
                  placeholder="456 Billing Ave"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Billing City</Label>
                <Input
                  className="mt-1"
                  value={form.billingCity || ''}
                  onChange={(e) => update({ billingCity: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Billing State</Label>
                <Select value={form.billingState || ''} onValueChange={(v) => update({ billingState: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {usStates.map((st) => (
                      <SelectItem key={st.code} value={st.code}>
                        {st.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">ZIP Code</Label>
                <Input
                  className="mt-1"
                  value={form.billingZip || ''}
                  onChange={(e) => update({ billingZip: e.target.value })}
                  placeholder="75201"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                className="mt-1"
                value={form.notes || ''}
                onChange={(e) => update({ notes: e.target.value })}
                placeholder="Internal notes about this customer..."
                rows={2}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Custom Fields */}
      <CustomFieldsSection
        entityType="CUSTOMER"
        values={form.customFieldValues ?? {}}
        onChange={(values) => setForm((prev) => ({ ...prev, customFieldValues: values }))}
        mode="edit"
      />
    </FormSheet>
  );
}

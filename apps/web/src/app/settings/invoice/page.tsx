'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@sally/ui/components/ui/card';
import { Label } from '@sally/ui/components/ui/label';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Button } from '@sally/ui/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Save } from 'lucide-react';
import { useInvoiceSettings, useUpdateInvoiceSettings } from '@/features/financials/invoicing/use-invoice-settings';
import type { InvoiceSettings } from '@/features/financials/invoicing';

type SectionKey = 'branding' | 'payment' | 'customization' | 'email';

const SECTION_FIELDS: Record<SectionKey, (keyof InvoiceSettings)[]> = {
  branding: [
    'companyLegalName',
    'mcNumber',
    'dotNumber',
    'address',
    'city',
    'state',
    'zip',
    'phone',
    'email',
    'logoUrl',
  ],
  payment: ['defaultPaymentTermsDays', 'remittanceInstructions', 'acceptedPaymentMethods'],
  customization: ['invoicePrefix', 'defaultNotes', 'termsAndConditions'],
  email: ['replyToEmail', 'emailSubjectTemplate', 'emailBodyTemplate'],
};

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64 mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function InvoiceSettingsPage() {
  const { data: settings, isLoading } = useInvoiceSettings();
  const updateSettings = useUpdateInvoiceSettings();
  const [form, setForm] = useState<Partial<InvoiceSettings>>({});
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleChange = useCallback((field: keyof InvoiceSettings, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveSection = useCallback(
    async (section: SectionKey) => {
      const fields = SECTION_FIELDS[section];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {};
      for (const field of fields) {
        if (field in form) {
          payload[field] = form[field];
        }
      }
      setSavingSection(section);
      try {
        await updateSettings.mutateAsync(payload);
      } finally {
        setSavingSection(null);
      }
    },
    [form, updateSettings],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Invoice Settings</h2>
          <p className="text-sm text-muted-foreground">Branding, payment terms, and invoice defaults</p>
        </div>
        <SettingsSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Invoice Settings</h2>
        <p className="text-sm text-muted-foreground">Branding, payment terms, and invoice defaults</p>
      </div>

      {/* Company Branding */}
      <Card>
        <CardHeader>
          <CardTitle>Company Branding</CardTitle>
          <CardDescription>
            Your company details as they appear on invoices. This information is printed on every invoice header.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyLegalName">Company Legal Name</Label>
              <Input
                id="companyLegalName"
                placeholder="Acme Trucking LLC"
                value={form.companyLegalName ?? ''}
                onChange={(e) => handleChange('companyLegalName', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcNumber">MC Number</Label>
              <Input
                id="mcNumber"
                placeholder="MC-123456"
                value={form.mcNumber ?? ''}
                onChange={(e) => handleChange('mcNumber', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dotNumber">DOT Number</Label>
              <Input
                id="dotNumber"
                placeholder="1234567"
                value={form.dotNumber ?? ''}
                onChange={(e) => handleChange('dotNumber', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                placeholder="123 Main St"
                value={form.address ?? ''}
                onChange={(e) => handleChange('address', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="Chicago"
                value={form.city ?? ''}
                onChange={(e) => handleChange('city', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                placeholder="IL"
                maxLength={2}
                value={form.state ?? ''}
                onChange={(e) => handleChange('state', e.target.value.toUpperCase() || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                placeholder="60601"
                value={form.zip ?? ''}
                onChange={(e) => handleChange('zip', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="(555) 123-4567"
                value={form.phone ?? ''}
                onChange={(e) => handleChange('phone', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="billing@acmetrucking.com"
                value={form.email ?? ''}
                onChange={(e) => handleChange('email', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                placeholder="https://example.com/logo.png"
                value={form.logoUrl ?? ''}
                onChange={(e) => handleChange('logoUrl', e.target.value || null)}
              />
              <p className="text-xs text-muted-foreground">
                Direct link to your company logo. Recommended size: 300x100px.
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button loading={savingSection === 'branding'} onClick={() => handleSaveSection('branding')}>
              <Save className="h-4 w-4 mr-2" />
              Save Branding
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Defaults */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Defaults</CardTitle>
          <CardDescription>
            Default payment terms applied to new invoices. Individual invoices can override these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultPaymentTermsDays">Payment Terms</Label>
              <Select
                value={String(form.defaultPaymentTermsDays ?? 30)}
                onValueChange={(v) => handleChange('defaultPaymentTermsDays', parseInt(v))}
              >
                <SelectTrigger id="defaultPaymentTermsDays">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">COD (Due on Receipt)</SelectItem>
                  <SelectItem value="15">NET 15</SelectItem>
                  <SelectItem value="30">NET 30</SelectItem>
                  <SelectItem value="45">NET 45</SelectItem>
                  <SelectItem value="60">NET 60</SelectItem>
                  <SelectItem value="90">NET 90</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acceptedPaymentMethods">Accepted Payment Methods</Label>
              <Input
                id="acceptedPaymentMethods"
                placeholder="Check, ACH, Wire Transfer"
                value={form.acceptedPaymentMethods ?? ''}
                onChange={(e) => handleChange('acceptedPaymentMethods', e.target.value || null)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated list of accepted payment methods.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="remittanceInstructions">Remittance Instructions</Label>
            <Textarea
              id="remittanceInstructions"
              placeholder="Please make checks payable to Acme Trucking LLC and mail to..."
              rows={3}
              value={form.remittanceInstructions ?? ''}
              onChange={(e) => handleChange('remittanceInstructions', e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground">
              Instructions printed on the invoice for how to submit payment.
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button loading={savingSection === 'payment'} onClick={() => handleSaveSection('payment')}>
              <Save className="h-4 w-4 mr-2" />
              Save Payment Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Customization */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Customization</CardTitle>
          <CardDescription>
            Customize invoice numbering, default notes, and terms printed on every invoice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
              <Input
                id="invoicePrefix"
                placeholder="INV-"
                maxLength={10}
                value={form.invoicePrefix ?? ''}
                onChange={(e) => handleChange('invoicePrefix', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Prefix for invoice numbers (max 10 characters). Example: INV-0001
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultNotes">Default Notes</Label>
            <Textarea
              id="defaultNotes"
              placeholder="Thank you for your business!"
              rows={3}
              value={form.defaultNotes ?? ''}
              onChange={(e) => handleChange('defaultNotes', e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground">
              Notes printed at the bottom of every invoice. Can be overridden per invoice.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="termsAndConditions">Terms &amp; Conditions</Label>
            <Textarea
              id="termsAndConditions"
              placeholder="Late payments are subject to a 1.5% monthly finance charge..."
              rows={4}
              value={form.termsAndConditions ?? ''}
              onChange={(e) => handleChange('termsAndConditions', e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground">
              Legal terms printed on every invoice. Typically includes late payment penalties and dispute procedures.
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button loading={savingSection === 'customization'} onClick={() => handleSaveSection('customization')}>
              <Save className="h-4 w-4 mr-2" />
              Save Customization
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Email Settings</CardTitle>
          <CardDescription>
            Configure the default email templates used when sending invoices to customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="replyToEmail">Reply-To Email</Label>
              <Input
                id="replyToEmail"
                type="email"
                placeholder="billing@acmetrucking.com"
                value={form.replyToEmail ?? ''}
                onChange={(e) => handleChange('replyToEmail', e.target.value || null)}
              />
              <p className="text-xs text-muted-foreground">
                Customers will reply to this address when responding to invoice emails.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailSubjectTemplate">Email Subject Template</Label>
            <Input
              id="emailSubjectTemplate"
              placeholder="Invoice {{invoiceNumber}} from {{companyName}}"
              value={form.emailSubjectTemplate ?? ''}
              onChange={(e) => handleChange('emailSubjectTemplate', e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground">
              Available merge fields: {'{{invoiceNumber}}'}, {'{{companyName}}'}, {'{{customerName}}'},{' '}
              {'{{amountDue}}'}, {'{{dueDate}}'}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailBodyTemplate">Email Body Template</Label>
            <Textarea
              id="emailBodyTemplate"
              placeholder={`Dear {{customerName}},\n\nPlease find attached invoice {{invoiceNumber}} for {{amountDue}}, due by {{dueDate}}.\n\nThank you for your business.\n\n{{companyName}}`}
              rows={6}
              value={form.emailBodyTemplate ?? ''}
              onChange={(e) => handleChange('emailBodyTemplate', e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground">
              Available merge fields: {'{{invoiceNumber}}'}, {'{{companyName}}'}, {'{{customerName}}'},{' '}
              {'{{amountDue}}'}, {'{{dueDate}}'}, {'{{paymentTerms}}'}
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button loading={savingSection === 'email'} onClick={() => handleSaveSection('email')}>
              <Save className="h-4 w-4 mr-2" />
              Save Email Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

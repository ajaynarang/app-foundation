'use client';

import { ChevronDown } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Separator } from '@sally/ui/components/ui/separator';
import { useState } from 'react';
import { useFactoringCompanies } from '@/features/financials/billing/hooks/use-invoices';
import { useTenantFactoringDefault } from '@/features/financials/invoicing';
import type { CustomerType, PaymentTerms } from '@sally/shared-types';
import type { CustomerCreate } from '../types';

export interface CustomerFormState extends Partial<CustomerCreate> {
  companyName: string;
  customerType: CustomerType;
}

export const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  companyName: '',
  customerType: 'BROKER',
};

const CUSTOMER_TYPES: { value: CustomerType; label: string; description?: string }[] = [
  { value: 'BROKER', label: 'Broker' },
  { value: 'SHIPPER', label: 'Shipper' },
  { value: 'THREE_PL', label: '3PL' },
  { value: 'CARRIER', label: 'Outside Carrier', description: 'A carrier we hire (no factoring)' },
];

const PAYMENT_TERMS: { value: PaymentTerms; label: string }[] = [
  { value: 'NET_15', label: 'Net 15' },
  { value: 'NET_30', label: 'Net 30' },
  { value: 'NET_45', label: 'Net 45' },
  { value: 'NET_60', label: 'Net 60' },
  { value: 'NET_90', label: 'Net 90' },
  { value: 'COD', label: 'COD' },
  { value: 'QUICK_PAY', label: 'Quick Pay' },
];

const BILLING_PATH_OPTIONS = [
  { value: 'none', label: 'Use tenant default' },
  { value: 'FACTORED', label: 'Factored (override)' },
  { value: 'DIRECT', label: 'Direct bill (never factor)' },
  { value: 'AMAZON', label: 'Amazon' },
] as const;

interface CustomerFormProps {
  value: CustomerFormState;
  onChange: (next: CustomerFormState) => void;
}

export function CustomerForm({ value, onChange }: CustomerFormProps) {
  const { data: factoringCompanies } = useFactoringCompanies();
  const { data: tenantDefault } = useTenantFactoringDefault();
  const [factoringExpanded, setFactoringExpanded] = useState(false);

  const set = <K extends keyof CustomerFormState>(key: K, v: CustomerFormState[K]) => onChange({ ...value, [key]: v });

  const showFactoring = value.customerType !== 'CARRIER';

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="customer-form-name">Company Name *</Label>
        <Input
          id="customer-form-name"
          autoFocus
          value={value.companyName}
          onChange={(e) => set('companyName', e.target.value)}
          placeholder="CH Robinson"
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="customer-form-type">Type *</Label>
          <Select
            value={value.customerType}
            onValueChange={(v) =>
              onChange({
                ...value,
                customerType: v as CustomerType,
                // Clear factoring overrides when switching to CARRIER — backend
                // rejects them anyway and the form section disappears.
                ...(v === 'CARRIER' ? { defaultBillingPath: undefined, defaultFactoringCompanyId: null } : {}),
              })
            }
          >
            <SelectTrigger id="customer-form-type" className="mt-1">
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
          <Label htmlFor="customer-form-mc">MC Number</Label>
          <Input
            id="customer-form-mc"
            value={value.mcNumber ?? ''}
            onChange={(e) => set('mcNumber', e.target.value)}
            placeholder="MC-123456"
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="customer-form-billing-email">Billing Email</Label>
          <Input
            id="customer-form-billing-email"
            type="email"
            value={value.billingEmail ?? ''}
            onChange={(e) => set('billingEmail', e.target.value)}
            placeholder="billing@example.com"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="customer-form-payment-terms">Payment Terms</Label>
          <Select value={value.paymentTerms ?? 'NET_30'} onValueChange={(v) => set('paymentTerms', v as PaymentTerms)}>
            <SelectTrigger id="customer-form-payment-terms" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="customer-form-notes">Notes</Label>
        <Textarea
          id="customer-form-notes"
          rows={2}
          value={value.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Internal notes about this customer…"
          className="mt-1"
        />
      </div>

      {showFactoring && (
        <>
          <Separator />
          <div>
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setFactoringExpanded((v) => !v)}
              aria-expanded={factoringExpanded}
            >
              <span>
                Factoring override (optional)
                {tenantDefault?.factoringCompany
                  ? ` — using tenant default ${tenantDefault.factoringCompany.companyName}`
                  : ' — no tenant default configured'}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${factoringExpanded ? 'rotate-180' : ''}`} />
            </button>
            {factoringExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div>
                  <Label>Default Billing Path</Label>
                  <Select
                    value={value.defaultBillingPath ?? 'none'}
                    onValueChange={(v) =>
                      onChange({
                        ...value,
                        defaultBillingPath: v === 'none' ? undefined : (v as 'FACTORED' | 'DIRECT'),
                        defaultFactoringCompanyId: v === 'FACTORED' ? (value.defaultFactoringCompanyId ?? null) : null,
                      })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Use tenant default" />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_PATH_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {value.defaultBillingPath === 'FACTORED' && (
                  <div>
                    <Label>Override Factoring Company</Label>
                    <Select
                      value={value.defaultFactoringCompanyId ? String(value.defaultFactoringCompanyId) : 'none'}
                      onValueChange={(v) => set('defaultFactoringCompanyId', v === 'none' ? null : Number(v))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {factoringCompanies?.map((c: { id: number; companyName: string }) => (
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
        </>
      )}
    </div>
  );
}

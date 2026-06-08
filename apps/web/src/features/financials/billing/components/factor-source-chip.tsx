'use client';

import { Info } from 'lucide-react';
import { useMemo } from 'react';
import { useFactoringCompanies } from '../hooks/use-invoices';
import { useTenantFactoringDefault } from '@/features/financials/invoicing';

const SOURCE_LABELS = {
  noFactor: 'Direct billing — no factor configured',
  customerOverride: 'from customer override',
  tenantDefault: 'from tenant default',
  invoiceValue: 'from invoice value',
} as const;

interface FactorSourceChipProps {
  invoice: {
    factoringCompanyId?: number | null;
    billingPath?: string | null;
  };
  customer?: {
    defaultFactoringCompanyId?: number | null;
    defaultBillingPath?: string | null;
  } | null;
}

/**
 * Read-only chip on invoice detail that explains where the factor was resolved
 * from. Renders one of:
 *   • "Direct billing — no factor configured"
 *   • "Factor: <name> — from tenant default"
 *   • "Factor: <name> — from customer override"
 *   • "Factor: <name> — from invoice value"  (chip-time fallback when neither
 *     tenant nor customer match the stamped value, e.g. tenant default flipped
 *     after invoice creation)
 */
export function FactorSourceChip({ invoice, customer }: FactorSourceChipProps) {
  const { data: companies } = useFactoringCompanies();
  const { data: tenantDefault } = useTenantFactoringDefault();

  const { name, source } = useMemo(() => {
    const stamped = invoice.factoringCompanyId ?? null;
    if (!stamped) {
      return { name: null, source: SOURCE_LABELS.noFactor };
    }
    const factor = companies?.find((c: { id: number; companyName: string }) => c.id === stamped);
    const factorName = factor?.companyName ?? `Company #${stamped}`;
    if (customer?.defaultFactoringCompanyId === stamped) {
      return { name: factorName, source: SOURCE_LABELS.customerOverride };
    }
    if (tenantDefault?.factoringCompanyId === stamped) {
      return { name: factorName, source: SOURCE_LABELS.tenantDefault };
    }
    return { name: factorName, source: SOURCE_LABELS.invoiceValue };
  }, [invoice, customer, companies, tenantDefault]);

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm dark:bg-muted/20"
      role="status"
      aria-label="Resolved factoring source"
    >
      <Info className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        {name ? (
          <span className="font-medium text-foreground">Factor: {name}</span>
        ) : (
          <span className="font-medium text-foreground">Direct billing</span>
        )}
        <span className="text-muted-foreground"> — {source}</span>
      </div>
    </div>
  );
}

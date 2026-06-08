'use client';

import { Badge } from '@app/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { CustomerCardData } from '../../engine/types';
import { formatCents } from './card-utils';

export function CustomerCard({ data }: { data: Record<string, unknown> }) {
  const c = data as unknown as CustomerCardData;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{c.companyName}</p>
        <Badge className={`${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`} variant="muted">
          {c.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        {c.contactEmail && <p>{c.contactEmail}</p>}
        {c.contactPhone && <p>{c.contactPhone}</p>}
        {c.paymentTerms && <p>Terms: {c.paymentTerms}</p>}
      </div>
      {(c.totalInvoicedCents != null || c.outstandingCents != null) && (
        <div className="grid grid-cols-2 gap-2 text-center">
          {c.totalInvoicedCents != null && (
            <div className="p-1.5 rounded bg-muted">
              <p className="text-sm font-bold text-foreground">{formatCents(c.totalInvoicedCents)}</p>
              <p className="text-2xs text-muted-foreground">Total Invoiced</p>
            </div>
          )}
          {c.outstandingCents != null && (
            <div className="p-1.5 rounded bg-muted">
              <p className="text-sm font-bold text-foreground">{formatCents(c.outstandingCents)}</p>
              <p className="text-2xs text-muted-foreground">Outstanding</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

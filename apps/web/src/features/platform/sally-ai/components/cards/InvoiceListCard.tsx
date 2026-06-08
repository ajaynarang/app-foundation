'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import type { InvoiceListCardData, InvoiceCardData } from '../../engine/types';
import { formatCents, invoiceStatusStyles } from './card-utils';

const MAX_VISIBLE = 10;

export function InvoiceListCard({ data }: { data: Record<string, unknown> }) {
  const listData = data as unknown as InvoiceListCardData;
  const visible = listData.invoices.slice(0, MAX_VISIBLE);
  const remaining = listData.totalCount - visible.length;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header */}
      <p className="text-sm font-medium text-foreground">Invoices ({listData.totalCount})</p>

      {/* Invoice rows */}
      <div className="space-y-1.5">
        {visible.map((inv: InvoiceCardData) => (
          <div key={inv.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
            {/* Number */}
            <span className="text-xs font-medium text-foreground shrink-0">{inv.number}</span>

            {/* Status badge */}
            <Badge
              className={`${invoiceStatusStyles[inv.status] ?? invoiceStatusStyles.DRAFT} text-2xs px-1.5 py-0 shrink-0`}
            >
              {inv.status}
            </Badge>

            {/* Customer name */}
            <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{inv.customerName}</span>

            {/* Balance */}
            <span className="text-xs font-medium text-foreground shrink-0">{formatCents(inv.balanceCents)}</span>
          </div>
        ))}
      </div>

      {/* Overflow indicator */}
      {remaining > 0 && <p className="text-2xs text-muted-foreground text-center">and {remaining} more...</p>}
    </div>
  );
}

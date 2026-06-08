'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { InvoiceCardData } from '../../engine/types';
import { formatCents, invoiceStatusStyles } from './card-utils';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';

export function InvoiceCard({ data }: { data: Record<string, unknown> }) {
  const { formatCalendarDate, isCalendarDateOverdue } = useFormatters();
  const inv = data as unknown as InvoiceCardData;
  const overdue = !(inv.status === 'PAID' || inv.status === 'VOID') && isCalendarDateOverdue(inv.dueDate);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header: Invoice number + status */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{inv.number}</span>
        <Badge className={invoiceStatusStyles[inv.status] ?? invoiceStatusStyles.DRAFT}>{inv.status}</Badge>
      </div>

      {/* Customer name */}
      <p className="text-xs text-muted-foreground">{inv.customerName}</p>

      {/* 3-column grid: Total / Paid / Balance */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xs text-muted-foreground">Total</p>
          <p className="text-xs font-medium text-foreground">{formatCents(inv.totalCents)}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">Paid</p>
          <p className="text-xs font-medium text-foreground">{formatCents(inv.paidCents)}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">Balance</p>
          <p className={`text-xs font-medium ${overdue ? SEMANTIC_COLORS.critical.text : 'text-foreground'}`}>
            {formatCents(inv.balanceCents)}
          </p>
        </div>
      </div>

      {/* Footer: Due date + line items */}
      <div className="flex items-center justify-between text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          Due: {formatCalendarDate(inv.dueDate, DISPLAY_FORMATS.FRIENDLY)}
          {overdue && <span className={`${SEMANTIC_COLORS.critical.text} font-medium`}>Overdue</span>}
        </span>
        <span>
          {inv.lineItemCount} item{inv.lineItemCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

'use client';

import { Badge } from '@app/ui/components/ui/badge';
import type { SettlementCardData } from '../../engine/types';
import { formatCents, settlementStatusStyles } from './card-utils';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';

export function SettlementCard({ data }: { data: Record<string, unknown> }) {
  const { formatCalendarDate } = useFormatters();
  const s = data as unknown as SettlementCardData;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header: Settlement number + status */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{s.number}</span>
        <Badge className={settlementStatusStyles[s.status] ?? settlementStatusStyles.DRAFT}>{s.status}</Badge>
      </div>

      {/* Driver name */}
      <p className="text-xs text-muted-foreground">{s.driverName}</p>

      {/* Period dates */}
      <p className="text-2xs text-muted-foreground">
        {formatCalendarDate(s.periodStart, DISPLAY_FORMATS.FRIENDLY)} &ndash;{' '}
        {formatCalendarDate(s.periodEnd, DISPLAY_FORMATS.FRIENDLY)}
      </p>

      {/* 3-column grid: Gross Pay / Deductions / Net Pay */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xs text-muted-foreground">Gross Pay</p>
          <p className="text-xs font-medium text-foreground">{formatCents(s.grossPayCents)}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">Deductions</p>
          <p className="text-xs font-medium text-muted-foreground">&minus;{formatCents(s.deductionsCents)}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">Net Pay</p>
          <p className="text-sm font-semibold text-foreground">{formatCents(s.netPayCents)}</p>
        </div>
      </div>

      {/* Footer: line item count */}
      <div className="flex items-center justify-end text-2xs text-muted-foreground">
        <span>
          {s.lineItemCount} item{s.lineItemCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import type { SettlementListCardData, SettlementCardData } from '../../engine/types';
import { formatCents, settlementStatusStyles } from './card-utils';

const MAX_VISIBLE = 10;

export function SettlementListCard({ data }: { data: Record<string, unknown> }) {
  const listData = data as unknown as SettlementListCardData;
  const visible = listData.settlements.slice(0, MAX_VISIBLE);
  const remaining = listData.totalCount - visible.length;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header */}
      <p className="text-sm font-medium text-foreground">Settlements ({listData.totalCount})</p>

      {/* Settlement rows */}
      <div className="space-y-1.5">
        {visible.map((s: SettlementCardData) => (
          <div key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
            {/* Number */}
            <span className="text-xs font-medium text-foreground shrink-0">{s.number}</span>

            {/* Driver name */}
            <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{s.driverName}</span>

            {/* Status badge */}
            <Badge
              className={`${settlementStatusStyles[s.status] ?? settlementStatusStyles.DRAFT} text-2xs px-1.5 py-0 shrink-0`}
            >
              {s.status}
            </Badge>

            {/* Net pay */}
            <span className="text-xs font-medium text-foreground shrink-0">{formatCents(s.netPayCents)}</span>
          </div>
        ))}
      </div>

      {/* Overflow indicator */}
      {remaining > 0 && <p className="text-2xs text-muted-foreground text-center">and {remaining} more...</p>}
    </div>
  );
}

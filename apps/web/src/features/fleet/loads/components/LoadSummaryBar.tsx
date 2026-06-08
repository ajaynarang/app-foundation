'use client';

import { cn } from '@sally/ui';

interface LoadSummaryBarProps {
  revenueCents: number;
  costCents: number;
  docsComplete: number;
  docsTotal: number;
  hasCharges: boolean;
  /** Whether any payable (cost) charges exist on this load */
  hasCosts: boolean;
}

export function LoadSummaryBar({
  revenueCents,
  costCents,
  docsComplete,
  docsTotal,
  hasCharges,
  hasCosts,
}: LoadSummaryBarProps) {
  // Margin is only meaningful when we have both revenue and cost data
  const canShowMargin = hasCosts && revenueCents > 0;
  const marginPct = canShowMargin ? Math.round(((revenueCents - costCents) / revenueCents) * 100) : null;
  const hasReadinessData = docsTotal > 0 && docsTotal !== docsComplete;

  return (
    <div className="flex border-b border-border bg-muted/30">
      <div className="flex-1 px-4 py-2.5 text-center border-r border-border">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Revenue</div>
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {hasCharges ? `$${(revenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—'}
        </div>
      </div>
      <div className="flex-1 px-4 py-2.5 text-center border-r border-border">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Margin</div>
        <div
          className={cn(
            'text-sm font-semibold tabular-nums',
            marginPct === null ? 'text-muted-foreground' : marginPct < 10 ? 'text-critical' : 'text-foreground',
          )}
        >
          {marginPct !== null ? `${marginPct}%` : '—'}
        </div>
      </div>
      <div className="flex-1 px-4 py-2.5 text-center border-r border-border">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Costs</div>
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {hasCosts ? `$${(costCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—'}
        </div>
      </div>
      <div className="flex-1 px-4 py-2.5 text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Docs</div>
        <div
          className={cn('text-sm font-semibold tabular-nums', hasReadinessData ? 'text-caution' : 'text-foreground')}
        >
          {hasReadinessData ? `${docsComplete}/${docsTotal}` : docsComplete > 0 ? String(docsComplete) : '—'}
        </div>
      </div>
    </div>
  );
}

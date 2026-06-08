'use client';

import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { InvoiceSummaryCardData } from '../../engine/types';
import { formatCents } from './card-utils';

export function InvoiceSummaryCard({ data }: { data: Record<string, unknown> }) {
  const summary = data as unknown as InvoiceSummaryCardData;
  const { agingBuckets } = summary;

  const totalAgingCents =
    agingBuckets.currentCents + agingBuckets.thirtyDayCents + agingBuckets.sixtyDayCents + agingBuckets.ninetyPlusCents;

  // Calculate percentages for stacked bar (guard against zero total)
  const pct = (cents: number) => (totalAgingCents > 0 ? (cents / totalAgingCents) * 100 : 0);

  const buckets = [
    {
      label: 'Current',
      cents: agingBuckets.currentCents,
      width: pct(agingBuckets.currentCents),
      barColor: SEMANTIC_COLORS.neutral.dot,
      textColor: SEMANTIC_COLORS.neutral.text,
    },
    {
      label: '30 Days',
      cents: agingBuckets.thirtyDayCents,
      width: pct(agingBuckets.thirtyDayCents),
      barColor: SEMANTIC_COLORS.neutral.dot,
      textColor: SEMANTIC_COLORS.neutral.text,
    },
    {
      label: '60 Days',
      cents: agingBuckets.sixtyDayCents,
      width: pct(agingBuckets.sixtyDayCents),
      barColor: SEMANTIC_COLORS.caution.dot,
      textColor: SEMANTIC_COLORS.caution.text,
    },
    {
      label: '90+ Days',
      cents: agingBuckets.ninetyPlusCents,
      width: pct(agingBuckets.ninetyPlusCents),
      barColor: SEMANTIC_COLORS.critical.dot,
      textColor: SEMANTIC_COLORS.critical.text,
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Total outstanding + overdue count */}
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-2xs text-muted-foreground">Total Outstanding</p>
          <p className="text-lg font-semibold text-foreground">{formatCents(summary.totalOutstandingCents)}</p>
        </div>
        {summary.overdueCount > 0 && (
          <div className="text-right">
            <p className="text-2xs text-muted-foreground">Overdue</p>
            <p className={`text-sm font-semibold ${SEMANTIC_COLORS.critical.text}`}>
              {summary.overdueCount} invoice{summary.overdueCount !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Aging stacked horizontal bar */}
      {totalAgingCents > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs text-muted-foreground font-medium">Aging Breakdown</p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {buckets.map(
              (bucket) =>
                bucket.width > 0 && (
                  <div
                    key={bucket.label}
                    className={`${bucket.barColor} transition-all`}
                    style={{ width: `${bucket.width}%` }}
                  />
                ),
            )}
          </div>
        </div>
      )}

      {/* 4-column grid: bucket labels + amounts */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {buckets.map((bucket) => (
          <div key={bucket.label}>
            <p className="text-2xs text-muted-foreground">{bucket.label}</p>
            <p className={`text-xs font-medium ${bucket.textColor}`}>{formatCents(bucket.cents)}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      {Object.keys(summary.countByStatus).length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border">
          {Object.entries(summary.countByStatus).map(([status, count]) => (
            <span key={status} className="text-2xs text-muted-foreground">
              {status}: <span className="font-medium text-foreground">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

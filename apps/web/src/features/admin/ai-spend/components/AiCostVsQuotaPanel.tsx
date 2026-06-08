'use client';

import { Skeleton } from '@sally/ui/components/ui/skeleton';

import { formatUsdPrecise } from '@/shared/lib/utils/formatters';

import { useAiCostVsQuota } from '../hooks';

interface AiCostVsQuotaPanelProps {
  tenantId: number;
  days: number;
}

/**
 * Side-by-side: USD cost (from the ledger) vs feature-use quota (from the
 * plan system). Makes the distinction explicit — they're independent limits.
 * Quota data is best-effort; when the quota read API isn't wired the right
 * column shows a "not yet available" note rather than empty space.
 */
export function AiCostVsQuotaPanel({ tenantId, days }: AiCostVsQuotaPanelProps) {
  const { data, isLoading } = useAiCostVsQuota(tenantId, days, true);

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (!data) {
    return <p className="text-muted-foreground text-sm">Couldn&apos;t load cost vs quota.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Cost — what we pay */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Cost — last {data.windowDays}d</p>
        <p className="text-xl font-bold text-foreground tabular-nums">{formatUsdPrecise(data.cost.totalUsd)}</p>
        <p className="text-xs text-muted-foreground">{data.cost.callCount.toLocaleString()} AI calls</p>
        <div className="pt-2 text-xs text-muted-foreground space-y-0.5">
          <div>
            Daily cap: {formatUsdPrecise(data.budget.dailySoftUsd)} soft / {formatUsdPrecise(data.budget.dailyHardUsd)}{' '}
            hard
          </div>
          <div>
            Monthly cap: {formatUsdPrecise(data.budget.monthlySoftUsd)} soft /{' '}
            {formatUsdPrecise(data.budget.monthlyHardUsd)} hard
          </div>
        </div>
      </div>

      {/* Quota — what the plan includes */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Quota — feature uses</p>
        {data.quota.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Quota consumption isn&apos;t wired into this view yet. Quota counts feature uses (e.g. ratecons/month); cost
            (left) caps actual dollars. Both fire independently — quota first, then cost budget.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.quota.map((q) => (
              <li key={q.featureKey} className="flex justify-between">
                <span className="text-foreground">{q.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {q.used.toLocaleString()}
                  {q.limit != null ? ` / ${q.limit.toLocaleString()}` : ' (unlimited)'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

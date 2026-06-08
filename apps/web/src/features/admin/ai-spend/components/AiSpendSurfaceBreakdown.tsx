'use client';

import { useMemo } from 'react';

import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { cn } from '@sally/ui';

import { formatUsdPrecise } from '@/shared/lib/utils/formatters';

import { useAiSpendBySurface } from '../hooks';
import { SURFACE_LABELS } from '../constants';
import type { AiSurface } from '../types';

interface AiSpendSurfaceBreakdownProps {
  tenantId: number;
  days: number;
}

/**
 * Horizontal bar breakdown of cost by surface for one tenant. Plain
 * Tailwind bars (no chart lib) — width is the surface's share of the max.
 */
export function AiSpendSurfaceBreakdown({ tenantId, days }: AiSpendSurfaceBreakdownProps) {
  const { data, isLoading } = useAiSpendBySurface(tenantId, days, true);

  const maxCost = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return Math.max(...data.map((r) => parseFloat(r.windowCostUsd)));
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No spend recorded in this window.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const cost = parseFloat(row.windowCostUsd);
        const widthPct = maxCost > 0 ? Math.max((cost / maxCost) * 100, 2) : 0;
        const meta = SURFACE_LABELS[row.surface as AiSurface];
        return (
          <div key={row.surface} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{meta?.label ?? row.surface}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatUsdPrecise(cost, 4)} · {row.windowCallCount.toLocaleString()} calls
                {row.windowErrorCount > 0 && <span className="text-red-500"> · {row.windowErrorCount} err</span>}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className={cn('h-2 rounded-full bg-foreground/70')} style={{ width: `${widthPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

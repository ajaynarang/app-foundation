'use client';

import { useMemo } from 'react';

import type { AiSpendTenantSummary } from '../types';

interface AiSpendSparklineProps {
  points: AiSpendTenantSummary['sparkline'];
}

/**
 * Tiny inline SVG sparkline of daily cost. No chart library — a polyline is
 * enough and keeps the bundle lean. Hidden on mobile by the parent (the
 * table column carries `hidden sm:table-cell`).
 */
export function AiSpendSparkline({ points }: AiSpendSparklineProps) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const costs = points.map((p) => parseFloat(p.costUsd));
    const max = Math.max(...costs, 0.000001);
    const w = 80;
    const h = 24;
    const step = w / (costs.length - 1);
    return costs
      .map((c, i) => {
        const x = i * step;
        const y = h - (c / max) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  if (!path) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <svg width={80} height={24} viewBox="0 0 80 24" className="text-foreground/70" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

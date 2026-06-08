'use client';

import { formatRelativeTime } from '@/shared/lib/utils/formatters';

interface MapLegendProps {
  movingCount: number;
  idleCount: number;
  parkedCount: number;
  lastUpdated: string | undefined;
}

const LEGEND_ITEMS = [
  { label: 'Moving', color: 'bg-emerald-500' },
  { label: 'Idle', color: 'bg-yellow-500' },
  { label: 'Parked', color: 'bg-gray-500' },
];

export function MapLegend({ movingCount, idleCount, parkedCount, lastUpdated }: MapLegendProps) {
  const counts = [movingCount, idleCount, parkedCount];
  const total = movingCount + idleCount + parkedCount;

  return (
    <div className="absolute bottom-8 left-3 z-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border p-2.5 shadow-md space-y-1.5">
      {LEGEND_ITEMS.map((item, i) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
          <span className="text-[11px] text-foreground font-medium">{item.label}</span>
          <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">{counts[i]}</span>
        </div>
      ))}
      <div className="border-t border-border pt-1 mt-1">
        <p className="text-2xs text-muted-foreground">
          {total} truck{total !== 1 ? 's' : ''}
          {lastUpdated && <> &middot; {formatRelativeTime(lastUpdated)}</>}
        </p>
      </div>
    </div>
  );
}

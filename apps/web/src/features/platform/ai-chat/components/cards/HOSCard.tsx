'use client';

import { Progress } from '@app/ui/components/ui/progress';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { MockDriver } from '../../engine/types';

export function HOSCard({ data }: { data: Record<string, unknown> }) {
  // Multiple drivers
  if (Array.isArray(data.drivers)) {
    const drivers = data.drivers as MockDriver[];
    return (
      <div className="space-y-2">
        {drivers.map((driver) => {
          const hosPercent = (driver.hosRemaining / 11) * 100;
          const isLow = driver.hosRemaining < 3;
          return (
            <div key={driver.id} className="rounded-lg border border-border bg-card p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{driver.name}</span>
                <span
                  className={`text-xs font-medium ${isLow ? SEMANTIC_COLORS.critical.text : 'text-muted-foreground'}`}
                >
                  {driver.hosRemaining}h
                </span>
              </div>
              <Progress value={hosPercent} className="h-1.5" />
            </div>
          );
        })}
      </div>
    );
  }

  // Single driver + next break
  const driver = data.driver as MockDriver | undefined;
  if (!driver) return null;
  const nextBreak = data.nextBreak as string | undefined;
  const hosPercent = (driver.hosRemaining / 11) * 100;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <p className="text-sm font-medium text-foreground">{driver.name} — HOS Status</p>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Drive Time Remaining</span>
          <span>{driver.hosRemaining}h / 11h</span>
        </div>
        <Progress value={hosPercent} className="h-2" />
      </div>
      {nextBreak && <p className="text-xs text-muted-foreground">Next break: ~{nextBreak}</p>}
    </div>
  );
}

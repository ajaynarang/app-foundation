'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { Progress } from '@sally/ui/components/ui/progress';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { MockDriver } from '../../engine/types';

const statusStyles: Record<string, string> = {
  driving: `${SEMANTIC_COLORS.info.bg} ${SEMANTIC_COLORS.info.text}`,
  at_dock: `${SEMANTIC_COLORS.info.bg} ${SEMANTIC_COLORS.info.text}`,
  resting: `${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.text}`,
  off_duty: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
};

export function DriverCard({ data }: { data: Record<string, unknown> }) {
  // Multiple drivers
  if (Array.isArray(data.drivers)) {
    const drivers = data.drivers as MockDriver[];
    return (
      <div className="space-y-2">
        {drivers.map((driver) => (
          <div key={driver.id} className="rounded-lg border border-border bg-card p-2 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground">
              {driver.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{driver.name}</p>
              <div className="flex items-center gap-2">
                <Badge className={`${statusStyles[driver.status]} text-2xs px-1.5 py-0`}>
                  {driver.status.replace('_', ' ')}
                </Badge>
                <span className="text-2xs text-muted-foreground">{driver.hosRemaining}h HOS</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Single driver
  const driver = data as unknown as MockDriver;
  const hosPercent = (driver.hosRemaining / 11) * 100;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground">
          {driver.name
            .split(' ')
            .map((n) => n[0])
            .join('')}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{driver.name}</p>
          <Badge className={statusStyles[driver.status]}>{driver.status.replace('_', ' ')}</Badge>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>HOS Remaining</span>
          <span>{driver.hosRemaining}h / 11h</span>
        </div>
        <Progress value={hosPercent} className="h-2" />
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Vehicle: {driver.vehicle}</span>
        {driver.currentRoute && <span>Route: {driver.currentRoute}</span>}
      </div>
    </div>
  );
}

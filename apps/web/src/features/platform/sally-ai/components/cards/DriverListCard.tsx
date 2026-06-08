'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import type { DriverListCardData } from '../../engine/types';
import { driverStatusStyles } from './card-utils';

export function DriverListCard({ data }: { data: Record<string, unknown> }) {
  const { drivers, totalCount } = data as unknown as DriverListCardData;

  return (
    <div className="space-y-2">
      {/* Header with count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {totalCount} driver{totalCount !== 1 ? 's' : ''}
        </span>
      </div>
      {drivers.map((d) => (
        <div key={d.driverId} className="rounded-lg border border-border bg-card p-2 flex items-center gap-3">
          {/* Initials avatar */}
          <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-foreground shrink-0">
            {d.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{d.name}</p>
            <p className="text-2xs text-muted-foreground">
              {d.assignedVehicle ? `Truck ${d.assignedVehicle}` : 'No vehicle'}
              {d.phone ? ` · ${d.phone}` : ''}
            </p>
          </div>
          <Badge className={`${driverStatusStyles[d.status] ?? driverStatusStyles.ACTIVE} text-2xs px-1.5 py-0.5`}>
            {d.status.replace('_', ' ')}
          </Badge>
        </div>
      ))}
    </div>
  );
}

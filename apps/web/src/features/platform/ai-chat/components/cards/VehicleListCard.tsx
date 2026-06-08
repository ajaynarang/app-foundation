'use client';

import { Badge } from '@app/ui/components/ui/badge';
import type { VehicleListCardData } from '../../engine/types';
import { vehicleStatusStyles } from './card-utils';

export function VehicleListCard({ data }: { data: Record<string, unknown> }) {
  const { vehicles, totalCount } = data as unknown as VehicleListCardData;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {totalCount} vehicle{totalCount !== 1 ? 's' : ''}
        </span>
      </div>
      {vehicles.map((v) => (
        <div key={v.vehicleId} className="rounded-lg border border-border bg-card p-2 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">{v.unitNumber}</p>
            <p className="text-2xs text-muted-foreground">
              {v.equipmentType}
              {v.assignedDriver ? ` · ${v.assignedDriver}` : ' · Unassigned'}
            </p>
          </div>
          <Badge className={`${vehicleStatusStyles[v.status] ?? vehicleStatusStyles.AVAILABLE} text-2xs px-1.5 py-0.5`}>
            {v.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      ))}
    </div>
  );
}

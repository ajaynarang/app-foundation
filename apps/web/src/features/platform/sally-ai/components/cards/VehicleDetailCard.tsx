'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { VehicleDetailCardData } from '../../engine/types';
import { vehicleStatusStyles } from './card-utils';

export function VehicleDetailCard({ data }: { data: Record<string, unknown> }) {
  const v = data as unknown as VehicleDetailCardData;

  const fuelPct = v.fuelCapacityGallons ? Math.round(((v.currentFuelGallons ?? 0) / v.fuelCapacityGallons) * 100) : 0;
  const fuelColor =
    fuelPct > 50
      ? SEMANTIC_COLORS.neutral.dot
      : fuelPct > 25
        ? SEMANTIC_COLORS.caution.dot
        : SEMANTIC_COLORS.critical.dot;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header: Unit number + status */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{v.unitNumber}</span>
        <Badge className={vehicleStatusStyles[v.status] ?? vehicleStatusStyles.AVAILABLE}>
          {v.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Make / Model / Year */}
      <p className="text-xs text-muted-foreground">{[v.year, v.make, v.model].filter(Boolean).join(' ')}</p>

      {/* VIN */}
      {v.vin && <p className="text-2xs text-muted-foreground">VIN: {v.vin}</p>}

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-1 text-2xs">
        <div>
          <span className="text-muted-foreground">Type: </span>
          <span className="text-foreground">{v.equipmentType}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Odometer: </span>
          <span className="text-foreground">
            {v.odometerMiles != null ? `${v.odometerMiles.toLocaleString()} mi` : '—'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Plate: </span>
          <span className="text-foreground">
            {[v.licensePlate, v.licensePlateState].filter(Boolean).join(' ') || '—'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Driver: </span>
          <span className="text-foreground">{v.assignedDriver ?? 'Unassigned'}</span>
        </div>
      </div>

      {/* Fuel level bar */}
      {v.currentFuelGallons != null && v.fuelCapacityGallons != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-2xs">
            <span className="text-muted-foreground">Fuel</span>
            <span className="text-foreground">
              {v.currentFuelGallons ?? 0}/{v.fuelCapacityGallons} gal ({fuelPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className={`h-full rounded-full ${fuelColor}`} style={{ width: `${fuelPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

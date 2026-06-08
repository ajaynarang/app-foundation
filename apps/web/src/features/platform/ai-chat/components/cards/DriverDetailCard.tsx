'use client';

import { Badge } from '@app/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { DriverDetailCardData } from '../../engine/types';
import { driverStatusStyles } from './card-utils';

export function DriverDetailCard({ data }: { data: Record<string, unknown> }) {
  const d = data as unknown as DriverDetailCardData;

  const isExpiringSoon =
    d.medicalCardExpiry && (new Date(d.medicalCardExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 30;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header: Name + status */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{d.name}</span>
        <Badge className={driverStatusStyles[d.status] ?? driverStatusStyles.ACTIVE}>{d.status}</Badge>
      </div>

      {/* Key-value grid */}
      <div className="grid grid-cols-2 gap-1">
        {d.phone && (
          <div>
            <p className="text-2xs text-muted-foreground">Phone</p>
            <p className="text-xs text-foreground">{d.phone}</p>
          </div>
        )}
        {d.email && (
          <div>
            <p className="text-2xs text-muted-foreground">Email</p>
            <p className="text-xs text-foreground">{d.email}</p>
          </div>
        )}
        {d.cdlClass && (
          <div>
            <p className="text-2xs text-muted-foreground">CDL Class</p>
            <p className="text-xs text-foreground">{d.cdlClass}</p>
          </div>
        )}
        {d.licenseNumber && (
          <div>
            <p className="text-2xs text-muted-foreground">License #</p>
            <p className="text-xs text-foreground">{d.licenseNumber}</p>
          </div>
        )}
        {d.licenseState && (
          <div>
            <p className="text-2xs text-muted-foreground">License State</p>
            <p className="text-xs text-foreground">{d.licenseState}</p>
          </div>
        )}
      </div>

      {/* Medical card expiry */}
      {d.medicalCardExpiry && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Medical Card Exp</span>
          <span className={isExpiringSoon ? `${SEMANTIC_COLORS.caution.text} font-medium` : 'text-foreground'}>
            {new Date(d.medicalCardExpiry).toLocaleDateString()}
            {isExpiringSoon && ' — Expiring soon'}
          </span>
        </div>
      )}

      {/* Assigned vehicle */}
      {d.assignedVehicle && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Assigned Vehicle</span>
          <span className="text-foreground">{d.assignedVehicle}</span>
        </div>
      )}

      {/* Emergency contact */}
      {d.emergencyContactName && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Emergency Contact</span>
          <span className="text-foreground">
            {d.emergencyContactName}
            {d.emergencyContactPhone && ` (${d.emergencyContactPhone})`}
          </span>
        </div>
      )}

      {/* Notes */}
      {d.notes && <p className="text-xs text-muted-foreground line-clamp-2">{d.notes}</p>}
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { formatDistance } from '@/shared/lib/utils/formatters';
import { useRelayEnabled, useLoadLegs } from '@/features/fleet/loads/hooks/use-load-legs';
import { RELAY_BADGE_CLASS } from '@/features/fleet/loads/constants/relay';
import { LegTimeline } from '../LegTimeline';
import { StopTimeline } from './shared/StopTimeline';
import type { Load, LoadLeg } from '@/features/fleet/loads/types';

interface RouteTabProps {
  load: Load;
}

export function RouteTab({ load }: RouteTabProps) {
  const { formatCalendarDate } = useFormatters();
  const relayEnabled = useRelayEnabled();
  const { data: legs } = useLoadLegs(relayEnabled && load.isRelay ? load.loadNumber : '');
  const hasLegs = !!(legs && legs.length > 0);
  const miles = load.actualMiles ?? load.estimatedMiles;

  const legTimelineData = useMemo(() => {
    if (!legs) return [];
    const stops = load.stops ?? [];
    const stopById = Object.fromEntries(stops.map((s) => [s.id, s]));
    return legs.map((leg: LoadLeg) => {
      const origin = stopById[leg.originStopId];
      const dest = stopById[leg.destStopId];
      return {
        legId: leg.legId,
        sequence: leg.sequence,
        status: leg.status,
        driverName: leg.driverName ?? null,
        vehicleUnitNumber: leg.vehicleUnitNumber ?? null,
        actualMiles: leg.actualMiles ?? null,
        assignedAt: leg.assignedAt ?? null,
        pickedUpAt: leg.pickedUpAt ?? null,
        deliveredAt: leg.deliveredAt ?? null,
        originCity: origin?.stopCity ?? '',
        originState: origin?.stopState ?? '',
        destCity: dest?.stopCity ?? '',
        destState: dest?.stopState ?? '',
      };
    });
  }, [legs, load.stops]);

  return (
    <div className="space-y-6">
      {/* Route stats bar */}
      {(miles != null || load.pickupDate || load.deliveryDate) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {miles != null && (
            <span>
              <span className="text-foreground font-medium">{formatDistance(miles)}</span> total
              {load.actualMiles != null && load.estimatedMiles != null && load.actualMiles !== load.estimatedMiles && (
                <span className="ml-1">({formatDistance(load.estimatedMiles)} est.)</span>
              )}
            </span>
          )}
          {load.pickupDate && (
            <span>
              Pickup:{' '}
              <span className="text-foreground font-medium">
                {formatCalendarDate(load.pickupDate, DISPLAY_FORMATS.FRIENDLY)}
              </span>
            </span>
          )}
          {load.deliveryDate && (
            <span>
              Delivery:{' '}
              <span className="text-foreground font-medium">
                {formatCalendarDate(load.deliveryDate, DISPLAY_FORMATS.FRIENDLY)}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Stops timeline */}
      <StopTimeline stops={load.stops ?? []} showExchangeStyle />

      {/* Relay Loads — read-only view */}
      {relayEnabled && load.isRelay && (
        <div className="space-y-3">
          {!hasLegs && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border">
              <ArrowDownUp className="h-4 w-4 text-purple-400" />
              <p className="text-sm text-muted-foreground">
                Relay mode enabled — click Edit to configure exchange points
              </p>
            </div>
          )}

          {hasLegs && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Relay Legs</h4>
                <Badge className={RELAY_BADGE_CLASS + ' text-2xs px-1.5 py-0 h-5'}>{legs!.length} legs</Badge>
              </div>
              <LegTimeline legs={legTimelineData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

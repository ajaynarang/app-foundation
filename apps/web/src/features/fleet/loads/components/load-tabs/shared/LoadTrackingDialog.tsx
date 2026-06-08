'use client';

import { useMemo } from 'react';
import { formatLoadLabel } from '@sally/shared-types';
import dynamic from 'next/dynamic';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { useMapData } from '@/features/operations/tower/hooks/use-map-data';
import { useRoutePlan, useRoutePlanGeoJSON } from '@/features/routing/route-planning/hooks/use-route-planning';
import type { MapTruckLocation } from '@/features/operations/tower/types';
import { formatDistance } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';

const TrackingMap = dynamic(() => import('./TrackingMap').then((m) => ({ default: m.TrackingMap })), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-full rounded-lg" />,
});

interface LoadTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string;
  referenceNumber?: string | null;
  routePlanId?: string | null;
}

export function LoadTrackingDialog({
  open,
  onOpenChange,
  loadId,
  loadNumber,
  referenceNumber,
  routePlanId,
}: LoadTrackingDialogProps) {
  const { formatTimestamp } = useFormatters();
  const { data: mapData, isLoading: mapLoading } = useMapData(open);
  const { data: routePlan } = useRoutePlan(open && routePlanId ? routePlanId : null);
  const { data: routeGeoJSON } = useRoutePlanGeoJSON(open && routePlanId ? routePlanId : null);

  const truck = useMemo<MapTruckLocation | null>(() => {
    if (!mapData?.trucks) return null;
    return mapData.trucks.find((t) => t.activeLoad?.loadNumber === loadId) ?? null;
  }, [mapData?.trucks, loadId]);

  // Extract ETA and progress from the active drive segment
  const activeSegment = useMemo(() => {
    if (!routePlan?.segments) return null;
    return routePlan.segments.find((s) => s.status === 'IN_PROGRESS' && s.segmentType === 'drive') ?? null;
  }, [routePlan?.segments]);

  const eta = routePlan?.estimatedArrival;
  const totalMiles = routePlan?.totalDistanceMiles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              Live Tracking — {formatLoadLabel(loadNumber, referenceNumber)}
              {truck && (
                <Badge
                  variant="outline"
                  className={`text-2xs ${
                    truck.status === 'moving'
                      ? 'bg-accent/10 text-accent border-accent/20'
                      : truck.status === 'idle'
                        ? 'bg-caution/10 text-caution border-caution/20'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {truck.status}
                </Badge>
              )}
            </DialogTitle>
            {/* ETA badge */}
            {eta && (
              <span className="text-xs text-muted-foreground">
                ETA{' '}
                <span className="text-foreground font-medium">
                  {formatTimestamp(eta, DISPLAY_FORMATS.COMPACT_DATE_TIME)}
                </span>
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 relative">
          {mapLoading ? (
            <Skeleton className="absolute inset-0" />
          ) : !truck ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No GPS data available for this load
            </div>
          ) : (
            <TrackingMap truck={truck} routeGeoJSON={routeGeoJSON} />
          )}
        </div>

        {/* Status strip */}
        {truck && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3 border-t border-border bg-muted/30 text-xs flex-shrink-0">
            <div>
              <span className="text-muted-foreground">Driver</span>
              <p className="font-medium text-foreground">{truck.driverName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Vehicle</span>
              <p className="font-medium text-foreground">{truck.vehicleIdentifier}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Speed</span>
              <p className="font-medium text-foreground">{Math.round(truck.speedMph)} mph</p>
            </div>
            {truck.hosDriveRemaining > 0 && (
              <div>
                <span className="text-muted-foreground">HOS Drive</span>
                <p
                  className={`font-medium ${
                    truck.hosStatus === 'critical'
                      ? 'text-critical'
                      : truck.hosStatus === 'warning'
                        ? 'text-caution'
                        : 'text-foreground'
                  }`}
                >
                  {truck.hosDriveRemaining.toFixed(1)}h
                </p>
              </div>
            )}
            {truck.fuelLevel != null && (
              <div>
                <span className="text-muted-foreground">Fuel</span>
                <p className="font-medium text-foreground">{truck.fuelLevel}%</p>
              </div>
            )}
            {totalMiles != null && (
              <div className="border-l border-border pl-4">
                <span className="text-muted-foreground">Route</span>
                <p className="font-medium text-foreground">{formatDistance(totalMiles)}</p>
              </div>
            )}
            {activeSegment?.distanceMiles != null && (
              <div>
                <span className="text-muted-foreground">Segment</span>
                <p className="font-medium text-foreground">{formatDistance(activeSegment.distanceMiles)}</p>
              </div>
            )}
            {truck.activeLoad && (
              <>
                <div className="border-l border-border pl-4">
                  <span className="text-muted-foreground">From</span>
                  <p className="font-medium text-foreground">{truck.activeLoad.origin.city}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">To</span>
                  <p className="font-medium text-foreground">{truck.activeLoad.destination.city}</p>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

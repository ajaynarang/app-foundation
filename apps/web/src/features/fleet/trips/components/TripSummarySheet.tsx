'use client';

import { formatLoadLabel, TripStatus } from '@sally/shared-types';
import type { TripStatus as TripStatusType } from '@sally/shared-types';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { ChevronUp, ChevronDown, User, X } from 'lucide-react';
import { useTripById } from '../hooks/use-trips';
import { useCancelTrip, useRemoveLoadFromTrip, useUpdateTrip } from '../hooks/use-trip-actions';
import { getTripColor } from '../utils';

interface TripSummarySheetProps {
  tripId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadClick?: (loadId: string) => void;
}

function getTripStatusVariant(status: TripStatusType) {
  switch (status) {
    case TripStatus.DRAFT:
      return 'outline' as const;
    case TripStatus.ASSIGNED:
      return 'default' as const;
    case TripStatus.IN_PROGRESS:
      return 'default' as const;
    case TripStatus.COMPLETED:
      return 'muted' as const;
    case TripStatus.CANCELLED:
      return 'destructive' as const;
    default:
      return 'outline' as const;
  }
}

export function TripSummarySheet({ tripId, open, onOpenChange, onLoadClick }: TripSummarySheetProps) {
  const { data: trip, isLoading } = useTripById(open ? tripId : null);
  const cancelTrip = useCancelTrip();
  const removeLoad = useRemoveLoadFromTrip();
  const updateTrip = useUpdateTrip();

  const canCancel = trip && ([TripStatus.DRAFT, TripStatus.ASSIGNED] as TripStatusType[]).includes(trip.status);
  const canModify = trip && !([TripStatus.COMPLETED, TripStatus.CANCELLED] as TripStatusType[]).includes(trip.status);

  // Move a load up/down in the trip sequence. Sends the full reordered list as
  // 1-based tripOrder; the backend validates membership and re-emits route-stale.
  const moveLoad = (fromIndex: number, direction: 'up' | 'down') => {
    if (!trip) return;
    const ordered = [...trip.loads].sort((a, b) => (a.tripOrder ?? 0) - (b.tripOrder ?? 0));
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= ordered.length) return;
    [ordered[fromIndex], ordered[toIndex]] = [ordered[toIndex], ordered[fromIndex]];
    updateTrip.mutate({
      tripId: trip.tripId,
      data: { loadOrder: ordered.map((l, i) => ({ loadId: l.loadNumber, tripOrder: i + 1 })) },
    });
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={trip?.tripId ?? 'Trip'}
      mode="view"
      entityType="trip"
      headerActions={
        canCancel ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (trip) cancelTrip.mutate(trip.tripId);
            }}
            loading={cancelTrip.isPending}
          >
            Cancel Trip
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : trip ? (
        <div className="p-4 space-y-4">
          {/* Status + assignment header */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getTripStatusVariant(trip.status)} className="capitalize">
              {trip.status.replace(/_/g, ' ').toLowerCase()}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {trip.loadCount} load{trip.loadCount !== 1 ? 's' : ''}
            </span>
            {trip.totalMiles && (
              <span className="text-xs text-muted-foreground">· {Math.round(trip.totalMiles)} mi</span>
            )}
          </div>

          {/* Driver / Vehicle */}
          {trip.driverName && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 dark:bg-gray-900/30 p-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-xs">
                <span className="text-foreground font-medium">{trip.driverName}</span>
                {trip.vehicleUnitNumber && (
                  <span className="text-muted-foreground ml-2">· {trip.vehicleUnitNumber}</span>
                )}
              </div>
            </div>
          )}

          {/* Financial summary */}
          <div className="rounded-lg border border-border bg-muted/30 dark:bg-gray-900/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Revenue</span>
              <span className="font-medium text-foreground">
                ${((trip.totalRevenueCents ?? 0) / 100).toLocaleString()}
              </span>
            </div>
            {trip.totalMiles && trip.totalRevenueCents ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">$/Mile</span>
                <span className="font-medium text-foreground">
                  ${(trip.totalRevenueCents / 100 / trip.totalMiles).toFixed(2)}
                </span>
              </div>
            ) : null}
          </div>

          {/* Loads list — ordered by trip sequence; reorderable while the trip is editable */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-muted-foreground">Loads</h4>
              {canModify && trip.loads.length > 1 && (
                <span className="text-[10px] text-muted-foreground/70">Reorder with ↑ ↓</span>
              )}
            </div>
            <div className="space-y-2">
              {[...trip.loads]
                .sort((a, b) => (a.tripOrder ?? 0) - (b.tripOrder ?? 0))
                .map((load, index, sorted) => (
                  <div
                    key={load.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 cursor-pointer hover:bg-accent/50 dark:hover:bg-gray-800/50 transition-colors"
                    onClick={() => onLoadClick?.(load.loadNumber)}
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: getTripColor(trip.tripId),
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground font-mono w-4 text-center">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-medium text-foreground">
                          {formatLoadLabel(load.loadNumber, load.referenceNumber)}
                        </span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {load.status.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {load.customerName} · {load.originCity}, {load.originState} → {load.destinationCity},{' '}
                        {load.destinationState}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-foreground shrink-0">
                      ${((load.rateCents ?? 0) / 100).toLocaleString()}
                    </span>
                    {canModify && sorted.length > 1 && (
                      <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-8"
                          aria-label="Move load earlier in trip"
                          disabled={index === 0 || updateTrip.isPending}
                          onClick={() => moveLoad(index, 'up')}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-8"
                          aria-label="Move load later in trip"
                          disabled={index === sorted.length - 1 || updateTrip.isPending}
                          onClick={() => moveLoad(index, 'down')}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {canModify && trip.loads.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        aria-label="Remove load from trip"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLoad.mutate({
                            tripId: trip.tripId,
                            loadId: load.loadNumber,
                          });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : null}
    </FormSheet>
  );
}

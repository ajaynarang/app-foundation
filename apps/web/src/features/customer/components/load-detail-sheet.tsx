'use client';

import { useMemo } from 'react';
import { formatLoadLabel, LoadStopStatusSchema } from '@sally/shared-types';

const STOP_STATUS = LoadStopStatusSchema.enum;
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Separator } from '@sally/ui/components/ui/separator';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { MapPin, Package, Calendar, Truck, CheckCircle2, Circle, Clock, Route } from 'lucide-react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { useCustomerLoadDetail } from '../hooks';
import { STATUS_CONFIG, formatEquipment, formatCommodity } from '../constants';
import type { CustomerLoad, CustomerLoadStop } from '../types';

interface LoadDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: CustomerLoad | null;
}

const TIMELINE_STEPS = [
  { key: 'booked', label: 'Booked' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'DELIVERED', label: 'Delivered' },
];

function getTimelineIndex(status: string): number {
  if (status === 'DELIVERED') return 2;
  if (status === 'IN_TRANSIT') return 1;
  return 0; // ASSIGNED, DISPATCHED, ON_HOLD → all show as "Booked" step
}

export function LoadDetailSheet({ open, onOpenChange, load }: LoadDetailSheetProps) {
  const sizing = useSheetSizing('customer-load');
  const { formatCalendarDate, formatTimestamp: _formatTimestamp } = useFormatters();
  const { data: detail, isLoading } = useCustomerLoadDetail(open && load ? load.loadNumber : null);

  const liveLoad = useMemo(() => {
    if (!load) return null;
    return detail ?? null;
  }, [load, detail]);

  const statusConfig = STATUS_CONFIG[load?.status || ''] || { label: load?.status || '', variant: 'muted' as const };
  const currentStep = getTimelineIndex(load?.status || '');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full p-0 flex flex-col"
        pinnable
        resizable
        defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
      >
        {/* Sticky Header */}
        <SheetHeader
          sticky
          actions={sizing.showControls ? <SheetSizeControls entityType="customer-load" /> : undefined}
        >
          <div className="flex items-center gap-3">
            <SheetTitle className="text-lg truncate">
              {load?.loadNumber ? formatLoadLabel(load.loadNumber, load.referenceNumber) : 'Load Detail'}
            </SheetTitle>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
          {load && (
            <SheetDescription className="text-sm">
              {load.originCity}
              {load.originState ? `, ${load.originState}` : ''} &rarr; {load.destinationCity}
              {load.destinationState ? `, ${load.destinationState}` : ''}
            </SheetDescription>
          )}
          {!load && <SheetDescription className="sr-only">Load details</SheetDescription>}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Separator />
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
              <Separator />
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Status Timeline */}
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" /> Status
                </h3>
                <div className="flex items-center gap-0">
                  {TIMELINE_STEPS.map((step, i) => {
                    const isCompleted = i <= currentStep;
                    const isCurrent = i === currentStep;
                    return (
                      <div key={step.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center flex-1">
                          <div
                            className={`flex items-center justify-center w-7 h-7 rounded-full border-2 ${
                              isCompleted
                                ? 'bg-foreground border-foreground text-background'
                                : 'bg-background border-border text-muted-foreground'
                            }`}
                          >
                            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
                          </div>
                          <span
                            className={`text-[11px] mt-1.5 text-center leading-tight ${
                              isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div
                            className={`h-0.5 w-full -mt-5 mx-0.5 rounded-full ${
                              i < currentStep ? 'bg-foreground' : 'bg-border'
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <Separator />

              {/* Stops */}
              {liveLoad &&
                liveLoad.stops &&
                liveLoad.stops.length > 0 &&
                (() => {
                  // Filter out exchange stops (relay handoff points) — defense-in-depth, backend also filters
                  const customerStops = liveLoad.stops.filter(
                    (stop: CustomerLoadStop) => (stop.actionType as string) !== 'exchange',
                  );
                  return customerStops.length > 0 ? (
                    <>
                      <section>
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                          <Route className="h-3.5 w-3.5" /> Stops
                        </h3>
                        <div className="space-y-3">
                          {customerStops.map((stop: CustomerLoadStop) => (
                            <StopCard key={stop.id} stop={stop} />
                          ))}
                        </div>
                      </section>

                      <Separator />
                    </>
                  ) : null;
                })()}

              {/* Shipment Details */}
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Package className="h-3.5 w-3.5" /> Shipment Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem
                    label="Equipment"
                    value={
                      liveLoad?.requiredEquipmentType ? formatEquipment(liveLoad.requiredEquipmentType) : undefined
                    }
                    icon={<Truck className="h-3 w-3" />}
                  />
                  <InfoItem
                    label="Weight"
                    value={liveLoad?.weightLbs ? `${liveLoad.weightLbs.toLocaleString()} lbs` : undefined}
                  />
                  <InfoItem
                    label="Commodity"
                    value={liveLoad?.commodityType ? formatCommodity(liveLoad.commodityType) : undefined}
                  />
                  <InfoItem label="Reference" value={liveLoad?.referenceNumber} />
                  <InfoItem
                    label="Est. Delivery"
                    value={
                      load?.estimatedDelivery
                        ? formatCalendarDate(load.estimatedDelivery, DISPLAY_FORMATS.FRIENDLY)
                        : undefined
                    }
                    icon={<Calendar className="h-3 w-3" />}
                  />
                  <InfoItem
                    label="Distance"
                    value={liveLoad?.estimatedMiles ? `${liveLoad.estimatedMiles.toLocaleString()} mi` : undefined}
                    icon={<MapPin className="h-3 w-3" />}
                  />
                </div>
              </section>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StopCard({ stop }: { stop: CustomerLoadStop }) {
  const { formatCalendarDate, formatTimestamp } = useFormatters();
  const isPickup = stop.actionType === 'pickup';
  const isCompleted = stop.status === STOP_STATUS.COMPLETED;
  const isArrived = stop.status === STOP_STATUS.ARRIVED;

  return (
    <div className="flex gap-3 p-3 rounded-lg border border-border bg-card">
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
          isCompleted
            ? 'bg-foreground text-background'
            : isArrived
              ? 'bg-muted-foreground text-background'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {isCompleted ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isArrived ? (
          <Clock className="h-4 w-4" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{isPickup ? 'Pickup' : 'Delivery'}</span>
          <Badge variant="muted" className="text-2xs">
            {stop.status || 'pending'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {stop.stopName || stop.stopAddress || 'Address pending'}
        </p>
        {(stop.stopCity || stop.stopState) && (
          <p className="text-sm text-muted-foreground">{[stop.stopCity, stop.stopState].filter(Boolean).join(', ')}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {stop.appointmentDate && (
            <span className="text-xs text-muted-foreground">
              Scheduled: {formatCalendarDate(stop.appointmentDate, DISPLAY_FORMATS.FRIENDLY)}
            </span>
          )}
          {stop.arrivedAt && (
            <span className="text-xs text-muted-foreground">Arrived: {formatTimestamp(stop.arrivedAt)}</span>
          )}
          {stop.completedAt && (
            <span className="text-xs text-muted-foreground">Completed: {formatTimestamp(stop.completedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { Truck, User, PauseCircle, Container, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { LoadLifecycleRail } from '../LoadLifecycleRail';
import { LoadNextStepCard } from '../LoadNextStepCard';
import { LoadRouteSummaryChip } from '../LoadRouteSummaryChip';
import { LaneIntelligenceCard } from './shared/LaneIntelligenceCard';
import type { Load } from '@/features/fleet/loads/types';
import type { BillingReadinessResult } from '@/features/financials/close-out/types';
import { formatDistance } from '@/shared/lib/utils/formatters';

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium text-foreground capitalize">{value}</p>
    </div>
  );
}

interface OverviewTabProps {
  load: Load;
  billingReadiness?: BillingReadinessResult | null;
  onDuplicate: () => void;
  onGoToFinancials?: () => void;
}

export function OverviewTab({ load, billingReadiness, onDuplicate, onGoToFinancials }: OverviewTabProps) {
  const loadStops = load.stops;
  const stops = useMemo(() => loadStops ?? [], [loadStops]);
  const originCity = load.originCity || stops[0]?.stopCity;
  const originState = load.originState || stops[0]?.stopState;
  const destCity = load.destinationCity || stops[stops.length - 1]?.stopCity;
  const destState = load.destinationState || stops[stops.length - 1]?.stopState;
  const hasAssignment = !!load.driverName;
  const miles = load.actualMiles ?? load.estimatedMiles;

  // Derive lane identity from stops for lane intelligence
  const { laneOriginState, laneDestState } = useMemo(() => {
    const pickupStops = stops.filter((s) => s.actionType === 'pickup' || s.actionType === 'both');
    const deliveryStops = stops.filter((s) => s.actionType === 'delivery' || s.actionType === 'both');
    return {
      laneOriginState: load.originState || pickupStops[0]?.stopState,
      laneDestState: load.destinationState || deliveryStops[deliveryStops.length - 1]?.stopState,
    };
  }, [stops, load.originState, load.destinationState]);

  return (
    <div className="space-y-5">
      {/* On-hold reason — top priority when load is held */}
      {load.status === 'ON_HOLD' && load.onHoldReason && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-caution/20 bg-caution/5">
          <PauseCircle className="h-4 w-4 text-caution flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-caution">On Hold</span>
            <p className="text-sm text-foreground mt-0.5">{load.onHoldReason}</p>
          </div>
        </div>
      )}

      {/* Lifecycle Rail */}
      <LoadLifecycleRail load={load} />

      {/* Next Step Card — contextual post-delivery actions */}
      <LoadNextStepCard
        load={load}
        billingReadiness={billingReadiness}
        onDuplicate={onDuplicate}
        onGoToFinancials={onGoToFinancials}
      />

      {/* Route visual — origin → destination with mileage */}
      {(originCity || destCity) && (
        <div className="p-3 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            {/* Origin */}
            <div className="flex-1 min-w-0">
              <span className="text-2xs text-muted-foreground uppercase tracking-wider">Origin</span>
              <p className="text-sm font-medium text-foreground truncate">
                {originCity && originState ? `${originCity}, ${originState}` : stops[0]?.stopName || '—'}
              </p>
            </div>

            {/* Connector */}
            <div className="flex items-center gap-1.5 flex-shrink-0 px-1">
              <div className="w-2 h-2 rounded-full bg-foreground" />
              <div className="w-8 h-px bg-border" />
              {miles != null && (
                <span className="text-2xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatDistance(miles)}
                </span>
              )}
              <div className="w-8 h-px bg-border" />
              <div className="w-2 h-2 rounded-full border-2 border-foreground" />
            </div>

            {/* Destination */}
            <div className="flex-1 min-w-0 text-right">
              <span className="text-2xs text-muted-foreground uppercase tracking-wider">Destination</span>
              <p className="text-sm font-medium text-foreground truncate">
                {destCity && destState ? `${destCity}, ${destState}` : stops[stops.length - 1]?.stopName || '—'}
              </p>
            </div>
          </div>
          {stops.length > 2 && (
            <p className="text-2xs text-muted-foreground text-center mt-1.5">{stops.length} stops total</p>
          )}
          <LoadRouteSummaryChip
            totalMiles={load.totalMiles}
            estimatedDriveHours={load.estimatedDriveHours}
            mileageProvider={load.mileageProvider}
          />
        </div>
      )}

      {/* Lane Intelligence */}
      <LaneIntelligenceCard
        originState={laneOriginState}
        destState={laneDestState}
        equipmentType={load.requiredEquipmentType ?? undefined}
        loadRateCents={load.rateCents}
        loadEstimatedMiles={load.estimatedMiles}
      />

      {/* Driver & Vehicle assignment */}
      {hasAssignment && (
        <div className="flex gap-3">
          <div className="flex-1 flex items-center gap-2.5 p-3 rounded-lg border border-border">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-2xs text-muted-foreground uppercase tracking-wider">Driver</span>
              <p className="text-sm font-medium text-foreground truncate">{load.driverName}</p>
            </div>
          </div>
          {load.vehicleNumber && (
            <div className="flex-1 flex items-center gap-2.5 p-3 rounded-lg border border-border">
              <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-2xs text-muted-foreground uppercase tracking-wider">Vehicle</span>
                <p className="text-sm font-medium text-foreground truncate">#{load.vehicleNumber}</p>
              </div>
            </div>
          )}
          {load.trailerUnitNumber && (
            <div className="flex-1 flex items-center gap-2.5 p-3 rounded-lg border border-border">
              <Container className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex items-center gap-1.5">
                <div>
                  <span className="text-2xs text-muted-foreground uppercase tracking-wider">Trailer</span>
                  <p className="text-sm font-medium text-foreground truncate">#{load.trailerUnitNumber}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Load details grid */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <InfoItem label="Customer" value={load.customerName} />
          <InfoItem label="Weight" value={`${load.weightLbs?.toLocaleString()} lbs`} />
          <InfoItem label="Commodity" value={load.commodityType} />
          <InfoItem label="Equipment" value={load.requiredEquipmentType?.replace(/_/g, ' ') || '—'} />
          {load.referenceNumber && <InfoItem label="Reference / PO" value={load.referenceNumber} />}
          {load.rateCents != null && (
            <InfoItem
              label="Rate"
              value={`$${(load.rateCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            />
          )}
          {load.pieces != null && <InfoItem label="Pieces" value={String(load.pieces)} />}
          {(load.minTempF != null || load.maxTempF != null) && (
            <InfoItem
              label="Temperature"
              value={
                load.minTempF != null && load.maxTempF != null
                  ? `${load.minTempF}°F – ${load.maxTempF}°F`
                  : load.minTempF != null
                    ? `Min ${load.minTempF}°F`
                    : `Max ${load.maxTempF}°F`
              }
            />
          )}
          {load.hazmatClass && <InfoItem label="Hazmat" value={load.hazmatClass} />}
          <InfoItem label="Intake" value={load.intakeSource || 'manual'} />
        </div>
        {load.specialRequirements && (
          <div>
            <span className="text-xs text-muted-foreground">Requirements</span>
            <p className="text-sm text-foreground">{load.specialRequirements}</p>
          </div>
        )}
      </div>
    </div>
  );
}

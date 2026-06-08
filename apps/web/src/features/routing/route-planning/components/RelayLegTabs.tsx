'use client';

import { User, Truck } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sally/ui/components/ui/tabs';
import { HOSDepartureGauges } from './HOSDepartureGauges';
import { RouteGlance } from './RouteGlance';
import { SegmentTimeline } from './SegmentTimeline';
import { WeatherAlertBanner } from './WeatherAlertBanner';
import type { RoutePlanResult } from '../types';

interface RelayLegPlan {
  legSequence: number;
  legId: string;
  driverName?: string;
  vehicleName?: string;
  /** Full plan result for this leg (absent if leg had an error) */
  plan?: RoutePlanResult;
  miles: number;
  schedule?: string;
  error?: string;
}

interface RelayLegTabsProps {
  legPlans: RelayLegPlan[];
  activeLegIndex: number;
  onLegChange: (index: number) => void;
  selectedSegmentId?: string | null;
  onSegmentSelect?: (segmentId: string | null) => void;
  hoveredSegmentId?: string | null;
  onSegmentHover?: (segmentId: string | null) => void;
}

export function RelayLegTabs({
  legPlans,
  activeLegIndex,
  onLegChange,
  selectedSegmentId,
  onSegmentSelect,
  hoveredSegmentId,
  onSegmentHover,
}: RelayLegTabsProps) {
  const _activeLeg = legPlans[activeLegIndex];

  return (
    <div className="space-y-4">
      {/* Relay badge header */}
      <div className="flex items-center gap-2">
        <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs">Relay Route</Badge>
        <span className="text-xs text-muted-foreground">{legPlans.length} legs</span>
      </div>

      {/* Leg tabs */}
      <Tabs value={String(activeLegIndex)} onValueChange={(val) => onLegChange(Number(val))}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {legPlans.map((leg, idx) => {
            const firstName = leg.driverName?.split(' ')[0] ?? 'Unassigned';
            const lastInitial = leg.driverName?.split(' ')[1]?.[0];
            const label = lastInitial ? `${firstName} ${lastInitial}.` : firstName;

            return (
              <TabsTrigger key={leg.legId} value={String(idx)} className="text-xs gap-1.5 min-w-0">
                <span className="font-medium">Leg {leg.legSequence}</span>
                <span className="text-muted-foreground hidden sm:inline">
                  — {label} &middot; {leg.miles.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {legPlans.map((leg, idx) => (
          <TabsContent key={leg.legId} value={String(idx)} className="space-y-4">
            {leg.error ? (
              <div className="rounded-lg border border-critical/30 bg-critical/5 p-4 text-sm text-critical">
                Leg {leg.legSequence} error: {leg.error}
              </div>
            ) : leg.plan ? (
              <LegContent
                leg={leg}
                selectedSegmentId={selectedSegmentId}
                onSegmentSelect={onSegmentSelect}
                hoveredSegmentId={hoveredSegmentId}
                onSegmentHover={onSegmentHover}
              />
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                No route plan available for Leg {leg.legSequence}.
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** Content for a single leg tab — driver/vehicle info, HOS, timeline, segments */
function LegContent({
  leg,
  selectedSegmentId,
  onSegmentSelect,
  onSegmentHover,
}: {
  leg: RelayLegPlan;
  selectedSegmentId?: string | null;
  onSegmentSelect?: (segmentId: string | null) => void;
  hoveredSegmentId?: string | null;
  onSegmentHover?: (segmentId: string | null) => void;
}) {
  const plan = leg.plan!;

  return (
    <>
      {/* Driver / Vehicle metadata */}
      <div className="flex items-center gap-4 text-sm">
        {leg.driverName && (
          <div className="flex items-center gap-1.5 text-foreground">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{leg.driverName}</span>
          </div>
        )}
        {leg.vehicleName && (
          <div className="flex items-center gap-1.5 text-foreground">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{leg.vehicleName}</span>
          </div>
        )}
        {leg.schedule && <span className="text-xs text-muted-foreground">{leg.schedule}</span>}
      </div>

      {/* HOS Departure Gauges */}
      <HOSDepartureGauges plan={plan} />

      {/* Weather Alert Banner */}
      <WeatherAlertBanner segments={plan.segments} />

      {/* Route Glance — proportional timeline bar */}
      <RouteGlance segments={plan.segments} onSegmentSelect={(id) => onSegmentSelect?.(id)} />

      {/* Segment Timeline */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          Leg {leg.legSequence} Segments
          <span className="text-2xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {plan.segments.filter((s) => s.segmentType !== 'drive').length} stops
          </span>
        </h2>
        <SegmentTimeline
          segments={plan.segments}
          planStatus={plan.status}
          planId={plan.planId}
          selectedSegmentId={selectedSegmentId}
          onSegmentSelect={onSegmentSelect ?? undefined}
          onSegmentHover={onSegmentHover ?? undefined}
          dailyBreakdown={plan.dailyBreakdown}
        />
      </div>
    </>
  );
}

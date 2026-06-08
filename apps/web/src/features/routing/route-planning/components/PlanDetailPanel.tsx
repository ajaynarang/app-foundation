'use client';

import { useState, useMemo } from 'react';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { PlanHeader } from './PlanHeader';
import { LoadDetails } from './LoadDetails';
import { RouteGlance } from './RouteGlance';
import { SegmentTimeline } from './SegmentTimeline';
import { ComplianceSummary } from './ComplianceSummary';
import { HOSDepartureGauges } from './HOSDepartureGauges';
import { WeatherAlertBanner } from './WeatherAlertBanner';
import { WhatIfPanel } from './WhatIfPanel';
import { DecisionFeedback, FEEDBACK_VARIANT } from './DecisionFeedback';
import { RelayLegTabs } from './RelayLegTabs';
import type { RoutePlanResult } from '../types';

interface PlanDetailPanelProps {
  plan: RoutePlanResult;
  /** 'detail' = plan detail page (back button, full actions). 'inline' = create-plan result */
  variant?: 'detail' | 'inline';
  /** Callback for "New Plan" button (inline variant only) */
  onNewPlan?: () => void;
  /** Selected segment ID for map sync (detail variant only) */
  selectedSegmentId?: string | null;
  /** Callback when segment is selected (detail variant only) */
  onSegmentSelect?: (segmentId: string | null) => void;
  /** Hovered segment ID for map sync */
  hoveredSegmentId?: string | null;
  /** Callback when segment is hovered */
  onSegmentHover?: (segmentId: string | null) => void;
  /** Assign mode: callback to assign load with this plan */
  onAssign?: () => void;
  /** Loading state for assign */
  isAssigning?: boolean;
}

export function PlanDetailPanel({
  plan,
  variant = 'detail',
  onNewPlan,
  selectedSegmentId: externalSelectedId,
  onSegmentSelect: externalOnSelect,
  hoveredSegmentId,
  onSegmentHover,
  onAssign,
  isAssigning,
}: PlanDetailPanelProps) {
  // Internal selection state for inline variant (no map sync needed)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [activeLegIndex, setActiveLegIndex] = useState(0);

  const selectedSegmentId = externalSelectedId ?? internalSelectedId;
  const onSegmentSelect = externalOnSelect ?? setInternalSelectedId;

  // Relay detection
  const isRelay = plan.routeType === 'relay' && !!plan.relayLegs?.length;
  const relayLegPlans = useMemo(() => {
    if (!isRelay || !plan.relayLegs) return [];
    return plan.relayLegs.map((leg) => ({
      legSequence: leg.legSequence,
      legId: leg.legId,
      driverName: leg.driverName,
      vehicleName: leg.vehicleName,
      plan: leg.plan as RoutePlanResult | undefined,
      miles: leg.miles,
      schedule: leg.schedule,
      error: leg.error,
    }));
  }, [isRelay, plan.relayLegs]);

  return (
    <div className="p-4 space-y-4">
      {/* Header: back/new-plan, plan ID, status, activate + context card with stats */}
      <PlanHeader
        plan={plan}
        variant={variant}
        onNewPlan={onNewPlan}
        showWhatIf={showWhatIf}
        onToggleWhatIf={() => setShowWhatIf(!showWhatIf)}
        onAssign={onAssign}
        isAssigning={isAssigning}
      />

      {/* What If panel — shown when toggled from pref tags */}
      {showWhatIf && <WhatIfPanel plan={plan} onClose={() => setShowWhatIf(false)} />}

      {/* Feasibility warning */}
      {!plan.isFeasible && plan.feasibilityIssues?.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>Feasibility Issues:</strong>
            <ul className="list-disc list-inside mt-1">
              {plan.feasibilityIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Load details — first, dispatcher needs to know WHAT before HOW */}
      {plan.loads && plan.loads.length > 0 && <LoadDetails loads={plan.loads} />}

      {/* Route content: relay legs or single-driver view */}
      {isRelay ? (
        <RelayLegTabs
          legPlans={relayLegPlans}
          activeLegIndex={activeLegIndex}
          onLegChange={setActiveLegIndex}
          selectedSegmentId={selectedSegmentId}
          onSegmentSelect={onSegmentSelect}
          hoveredSegmentId={hoveredSegmentId}
          onSegmentHover={onSegmentHover}
        />
      ) : (
        <>
          {/* HOS Departure Gauges */}
          <HOSDepartureGauges plan={plan} />

          {/* Weather Alert Banner */}
          <WeatherAlertBanner segments={plan.segments} />

          {/* Route Glance — proportional timeline bar */}
          <RouteGlance segments={plan.segments} onSegmentSelect={(id) => onSegmentSelect(id)} />

          {/* Segment Timeline — the core view */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              Route Segments
              <span className="text-2xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {plan.segments.filter((s) => s.segmentType !== 'drive').length} stops
              </span>
            </h2>
            <SegmentTimeline
              segments={plan.segments}
              planStatus={plan.status}
              planId={plan.planId}
              selectedSegmentId={selectedSegmentId}
              onSegmentSelect={onSegmentSelect}
              onSegmentHover={onSegmentHover}
              dailyBreakdown={plan.dailyBreakdown}
            />
          </div>
        </>
      )}

      {/* Compliance Summary (replaces SallyDecisions) */}
      <ComplianceSummary plan={plan} />

      {/* Plan-level feedback — overall route quality */}
      <div className="pt-2 border-t border-border">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          Rate this Smart Route
        </p>
        <DecisionFeedback
          planId={plan.planId}
          segmentId={`plan-overall-${plan.planId}`}
          variant={FEEDBACK_VARIANT.PLAN}
        />
      </div>
    </div>
  );
}

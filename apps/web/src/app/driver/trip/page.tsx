'use client';

import { useState, useRef, useEffect } from 'react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { cn } from '@sally/ui';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { useAuthStore } from '@/features/auth';
import { useDriverHome } from '@/features/fleet/drivers/hooks/use-driver-home';
import { STOP_STATUS } from './lib/constants';
import { useDriverActiveRoutePlan } from '@/features/routing/route-planning';
import { getCurrentSegment, getGreeting } from './lib/route-state';
import { TripDashboard } from './components/TripDashboard';
import { TripSequenceBanner } from './components/TripSequenceBanner';
import { TripCompletionCard } from './components/TripCompletionCard';
import { TripHeader } from './components/TripHeader';
import { TripTimeline } from './components/TripTimeline';
import { stopHasPrimaryDoc } from './lib/stop-docs';
import { SmartHOSStrip, type HOSState } from './components/SmartHOSStrip';
import { HOSWarningBanner } from './components/HOSWarningBanner';
import { ArrivalCard } from './components/SallyTipCard';
import { NavigateFAB } from './components/NavigateFAB';
import { RequestReplanButton } from './components/RequestReplanButton';
import { ActionFAB } from './components/ActionFAB';
import { ActionSheet, type ActionType } from './components/ActionSheet';
import { LumperRequestForm } from './components/LumperRequestForm';
import { DetentionReportForm } from './components/DetentionReportForm';
import { ScaleTicketForm } from './components/ScaleTicketForm';
import { FuelReceiptForm } from './components/FuelReceiptForm';
import { IssueReportForm } from './components/IssueReportForm';

function TripPageSkeleton() {
  return (
    <div className="space-y-4 py-4 px-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-8 w-full rounded-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-[10px] mt-2.5 shrink-0" />
          <Skeleton className="h-20 flex-1 rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}

function TripContent() {
  const { user } = useAuthStore();
  const driverId = user?.driverId ?? '';

  const { driver, hos, currentLoad, nextStop, trip, isLoading: isDriverLoading } = useDriverHome();

  const { data: plan, isLoading: isPlanLoading } = useDriverActiveRoutePlan(driverId);

  const [viewMode, setViewMode] = useState<'trip' | 'dashboard'>('trip');
  const [dockBannerDismissed, setDockBannerDismissed] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);

  // ─── Hold last load for completion card ──────────────────────────────────────
  // When the last stop completes, the backend moves the load to "delivered" and
  // clears driver.currentLoad. Without this ref, the completion card (with doc
  // upload prompts) never renders — the page jumps straight to the dashboard.
  // The ref preserves the load data so TripCompletionCard can show.
  const lastLoadRef = useRef(currentLoad);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    if (currentLoad) {
      // Track the active load
      lastLoadRef.current = currentLoad;
      setShowCompletion(false);
    } else if (lastLoadRef.current) {
      // Load just disappeared (delivered) — show completion card
      setShowCompletion(true);
    }
  }, [currentLoad]);

  if (isDriverLoading || isPlanLoading) {
    return <TripPageSkeleton />;
  }

  const driverName = driver?.name?.split(' ')[0] || 'Driver';

  // ─── Compute HOS remaining values ────────────────────────────────────────────
  // `hos` (DriverHOS) has: hoursDriven, onDutyTime, hoursSinceBreak — no cycle.
  // `driver` carries cycleHoursUsed and currentHos (pre-computed remainders).
  // SmartHOSStrip / HOSDetailExpanded expect computed-remaining HOSState.
  const computedHosState: HOSState | null = hos
    ? {
        driveHoursRemaining: Math.max(0, 11 - (hos.hoursDriven ?? 0)),
        shiftHoursRemaining: Math.max(0, 14 - (hos.onDutyTime ?? 0)),
        cycleHoursRemaining: Math.max(0, 70 - (driver?.cycleHoursUsed ?? 0)),
        breakHoursRemaining: Math.max(0, 8 - (hos.hoursSinceBreak ?? 0)),
      }
    : driver?.currentHos
      ? {
          driveHoursRemaining: driver.currentHos.driveRemaining ?? 0,
          shiftHoursRemaining: driver.currentHos.shiftRemaining ?? 0,
          cycleHoursRemaining: driver.currentHos.cycleRemaining ?? 0,
          breakHoursRemaining: Math.max(0, 8 - (driver.currentHoursSinceBreak ?? 0)),
        }
      : driver
        ? {
            // Fallback: use DB fields or assume full HOS when no ELD data
            driveHoursRemaining: Math.max(0, 11 - (driver.currentHoursDriven ?? 0)),
            shiftHoursRemaining: 14,
            cycleHoursRemaining: Math.max(0, 70 - (driver.cycleHoursUsed ?? 0)),
            breakHoursRemaining: Math.max(0, 8 - (driver.currentHoursSinceBreak ?? 0)),
          }
        : null;

  // ─── HOS warning: drive < 3h (earlier warning for better planning) ───────────
  const driveHoursRemaining = computedHosState?.driveHoursRemaining ?? 99;
  const showHosWarning = driveHoursRemaining < 3;

  // ─── State: no active load ────────────────────────────────────────────────────
  const greetingLine = `${getGreeting()}, ${driverName}`;

  // Show completion card when load just finished (backend cleared currentLoad
  // but we still have the data in the ref for doc upload prompts)
  if (!currentLoad && showCompletion && lastLoadRef.current) {
    const completedLoad = lastLoadRef.current;
    const completedStops = completedLoad.stops ?? [];
    const pendingDocs = completedStops.filter((s) => {
      if (s.actionType === 'pickup' || s.actionType === 'delivery' || s.actionType === 'both') {
        return !stopHasPrimaryDoc(s);
      }
      return false;
    });

    return (
      <>
        <div className="flex items-center px-3 pt-3 pb-1">
          <p className="text-sm text-muted-foreground">{greetingLine}</p>
        </div>
        <TripCompletionCard
          load={completedLoad}
          plan={plan ?? undefined}
          driverName={driverName}
          pendingDocStops={pendingDocs}
        />
        <SmartHOSStrip hosState={computedHosState} />
      </>
    );
  }

  if (!currentLoad) {
    return (
      <>
        <div className="flex items-center px-3 pt-3 pb-1">
          <p className="text-sm text-muted-foreground">{greetingLine}</p>
        </div>
        <TripDashboard driverName={driverName} />
        <SmartHOSStrip hosState={computedHosState} />
      </>
    );
  }

  // greetingLine already computed above

  // ─── State: all stops complete ────────────────────────────────────────────────
  const stops = currentLoad.stops ?? [];
  const allStopsComplete = stops.length > 0 && stops.every((s) => s.status === STOP_STATUS.COMPLETED);

  // Check if any stop still needs docs (BOL for pickup, POD for delivery)
  // Uses stopHasPrimaryDoc which checks both text fields AND uploaded Document records
  const stopsNeedingDocs = stops.filter((s) => {
    if (s.actionType === 'pickup' || s.actionType === 'delivery' || s.actionType === 'both') {
      return !stopHasPrimaryDoc(s);
    }
    return false;
  });
  if (allStopsComplete) {
    return (
      <>
        <div className="flex items-center px-3 pt-3 pb-1">
          <p className="text-sm text-muted-foreground">{greetingLine}</p>
        </div>
        <TripCompletionCard
          load={currentLoad}
          plan={plan ?? undefined}
          driverName={driverName}
          pendingDocStops={stopsNeedingDocs}
        />
        <SmartHOSStrip hosState={computedHosState} />
      </>
    );
  }

  // ─── Determine at-dock vs driving ────────────────────────────────────────────
  // At dock: next stop (first non-complete) has arrived/in_progress/loading status
  const currentStop = nextStop;
  const atDockStatuses = new Set(['arrived', 'in_progress', 'loading']);
  const isAtDock = !!currentStop && atDockStatuses.has(currentStop.status ?? '');

  // For smart route plans: find the active segment
  const activeSegment = getCurrentSegment(plan);
  const isDriveSegment = activeSegment?.segmentType === 'drive';

  // NavigateFAB destination — prefer active segment coords, fall back to next stop
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabLat = activeSegment?.toLat ?? (currentStop as any)?.stopLat ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabLon = activeSegment?.toLon ?? (currentStop as any)?.stopLon ?? 0;
  const fabName =
    activeSegment?.toLocation ??
    currentStop?.stopName ??
    [currentStop?.stopCity, currentStop?.stopState].filter(Boolean).join(', ');

  // FAB is visible when driving (not at dock) and either it's a drive segment
  // (smart route) or there's a manual next stop
  const isDriving = !isAtDock;
  const fabVisible = isDriving && fabLat !== 0 && fabLon !== 0 && (isDriveSegment || !plan);

  // ─── Next rest miles from plan segments (for HOS warning) ────────────────────
  const nextRestMiles: number | undefined = (() => {
    if (!plan?.segments?.length || !activeSegment) return undefined;
    const sorted = [...plan.segments].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const activeIdx = sorted.findIndex((s) => s.segmentId === activeSegment.segmentId);
    if (activeIdx < 0) return undefined;
    let miles = 0;
    for (let i = activeIdx; i < sorted.length; i++) {
      const seg = sorted[i];
      if (seg.segmentType === 'rest' || seg.segmentType === 'break') {
        return miles > 0 ? miles : undefined;
      }
      miles += seg.distanceMiles ?? 0;
    }
    return undefined;
  })();

  // SallyTip stop type for at-dock banner
  const tipStopType: 'pickup' | 'delivery' = currentStop?.actionType === 'delivery' ? 'delivery' : 'pickup';

  // ─── Active load render (states 3–5) ─────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Greeting + inline toggle */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <p className="text-sm text-muted-foreground">{greetingLine}</p>
        <div className="flex items-center rounded-full border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-all',
              viewMode === 'trip'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setViewMode('trip')}
          >
            Trip
          </button>
          <button
            type="button"
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-all',
              viewMode === 'dashboard'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setViewMode('dashboard')}
          >
            Dashboard
          </button>
        </div>
      </div>

      {viewMode === 'dashboard' ? (
        <TripDashboard driverName={driverName} />
      ) : (
        <>
          {/* Multi-load trip: show the full sequence the dispatcher grouped for this
              driver, with the current load highlighted. Only when it's a 2+ load trip. */}
          {trip && (
            <div className="px-3">
              <TripSequenceBanner trip={trip} />
            </div>
          )}

          {/* Load header — inside My Trip, tappable for full details sheet */}
          <div className="px-3">
            <TripHeader load={currentLoad} plan={plan ?? undefined} />
          </div>

          {/* HOS warning banner */}
          {showHosWarning && hos && (
            <div className="px-3 pt-3">
              <HOSWarningBanner
                hosState={{
                  hoursDriven: hos.hoursDriven,
                  onDutyTime: hos.onDutyTime,
                  hoursSinceBreak: hos.hoursSinceBreak,
                  cycleHoursUsed: driver?.cycleHoursUsed ?? 0,
                }}
                hasRoutePlan={!!plan}
                nextRestMiles={nextRestMiles}
              />
            </div>
          )}

          {/* At-dock: Combined arrival banner + Sally tip — Redesign #6 */}
          {isAtDock && currentStop && !dockBannerDismissed && (
            <div className="px-3 pt-3">
              <ArrivalCard
                stopType={tipStopType}
                stopName={
                  currentStop.stopName ?? [currentStop.stopCity, currentStop.stopState].filter(Boolean).join(', ')
                }
                onDismiss={() => setDockBannerDismissed(true)}
              />
            </div>
          )}

          {/* Main timeline — scrollable */}
          <div className="flex-1 overflow-y-auto px-3 pt-2">
            <TripTimeline
              load={currentLoad}
              plan={plan ?? undefined}
              driveHoursRemaining={computedHosState?.driveHoursRemaining}
              currentStop={currentStop ?? undefined}
              onDriverAction={(action) => setActiveAction(action)}
            />
          </div>

          {/* Request replan button (smart route only) */}
          {plan && (
            <div className="px-3 pb-4 pt-2">
              <RequestReplanButton planId={plan.planId} />
            </div>
          )}

          {/* Navigate FAB */}
          <NavigateFAB destinationLat={fabLat} destinationLon={fabLon} destinationName={fabName} visible={fabVisible} />

          {/* Action FAB — positioned bottom-left, complement to Navigate FAB on right */}
          <ActionFAB visible={!!currentLoad} onClick={() => setActionSheetOpen(true)} />

          {/* Action Sheet */}
          <ActionSheet
            open={actionSheetOpen}
            onOpenChange={setActionSheetOpen}
            loadNumber={currentLoad?.loadNumber}
            onAction={(action) => setActiveAction(action)}
          />

          {/* Driver Action Forms */}
          {activeAction === 'lumper' && (
            <LumperRequestForm
              open
              onOpenChange={(open) => {
                if (!open) setActiveAction(null);
              }}
              loadId={currentLoad.loadNumber}
              stopId={currentStop?.id}
            />
          )}
          {activeAction === 'detention' && (
            <DetentionReportForm
              open
              onOpenChange={(open) => {
                if (!open) setActiveAction(null);
              }}
              loadId={currentLoad.loadNumber}
              stopId={currentStop?.id}
            />
          )}
          {activeAction === 'scale_ticket' && (
            <ScaleTicketForm
              open
              onOpenChange={(open) => {
                if (!open) setActiveAction(null);
              }}
              loadId={currentLoad.loadNumber}
              loadDbId={currentLoad.id}
            />
          )}
          {activeAction === 'fuel_receipt' && (
            <FuelReceiptForm
              open
              onOpenChange={(open) => {
                if (!open) setActiveAction(null);
              }}
              loadId={currentLoad.loadNumber}
              loadDbId={currentLoad.id}
            />
          )}
          {activeAction === 'issue_report' && (
            <IssueReportForm
              open
              onOpenChange={(open) => {
                if (!open) setActiveAction(null);
              }}
              loadId={currentLoad.loadNumber}
            />
          )}
        </>
      )}

      {/* Smart HOS nudge pill — always visible, both Trip and Dashboard views */}
      <SmartHOSStrip hosState={computedHosState} />
    </div>
  );
}

export default function TripPage() {
  return (
    <FeatureGuard featureKey="driver_app">
      <TripContent />
    </FeatureGuard>
  );
}

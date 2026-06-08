'use client';

import { ArrowLeft, User, Truck, Clock, Gauge, X, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Separator } from '@sally/ui/components/ui/separator';
import { CostBreakdownPanel } from './CostBreakdownPanel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@sally/ui/components/ui/alert-dialog';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useActivateRoute, useCancelRoute, useReplanRoute } from '@/features/routing/route-planning';
import type { RoutePlanResult } from '@/features/routing/route-planning';
import { formatHours, statusVariant, statusBadgeClassName } from './plan-utils';

interface PlanHeaderProps {
  plan: RoutePlanResult;
  /** 'detail' shows back button. 'inline' shows "New Plan" button */
  variant?: 'detail' | 'inline';
  /** Callback for "New Plan" button (inline variant only) */
  onNewPlan?: () => void;
  /** Whether to show "What if?" panel */
  showWhatIf?: boolean;
  /** Toggle "What if?" panel */
  onToggleWhatIf?: () => void;
  /** Assign mode: show "Assign & Activate" instead of "Activate Route" */
  onAssign?: () => void;
  /** Loading state for assign action */
  isAssigning?: boolean;
}

function formatPriority(p?: string) {
  switch (p) {
    case 'minimize_time':
      return 'Fastest';
    case 'minimize_cost':
      return 'Cheapest';
    default:
      return 'Balanced';
  }
}

function formatRestType(type?: string) {
  switch (type) {
    case 'full':
      return 'Full rest';
    case 'split_8_2':
      return 'Split 8+2';
    case 'split_7_3':
      return 'Split 7+3';
    default:
      return 'Auto rest';
  }
}

export function PlanHeader({
  plan,
  variant = 'detail',
  onNewPlan,
  showWhatIf,
  onToggleWhatIf,
  onAssign,
  isAssigning,
}: PlanHeaderProps) {
  const { formatTimestamp } = useFormatters();
  const router = useRouter();
  const activateRoute = useActivateRoute();
  const cancelRoute = useCancelRoute();
  const replanRoute = useReplanRoute();
  const [isActivated, setIsActivated] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  const currentStatus = isActivated ? 'ACTIVE' : plan.status;
  const params = plan.dispatcherParams;
  const isRelay = plan.routeType === 'relay' && !!plan.relayLegs?.length;

  // Task 12: ETA Buffer — compare delivery ETA against appointment window
  // The engine stores appointmentWindow on segments when available
  const etaBuffer = useMemo(() => {
    // Find last delivery dock segment
    const dockSegments = plan.segments.filter(
      (s) => s.segmentType === 'dock' && s.actionType?.toLowerCase() === 'delivery',
    );
    const lastDelivery = dockSegments[dockSegments.length - 1];
    if (!lastDelivery?.estimatedArrival) return null;

    // Check if segment has appointment window data (from engine's appointmentWindow field)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seg = lastDelivery as any;
    const windowEnd = seg.appointmentWindowEnd ?? seg.appointmentWindow?.end;

    if (!windowEnd) return null; // No window data — hide buffer (don't show misleading number)

    const eta = new Date(lastDelivery.estimatedArrival);
    const windowEndDate = new Date(windowEnd);
    const bufferMs = windowEndDate.getTime() - eta.getTime();
    return Math.round(bufferMs / 60000);
  }, [plan]);

  const handleActivate = async () => {
    try {
      await activateRoute.mutateAsync(plan.planId);
      setIsActivated(true);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleDiscard = async () => {
    try {
      await cancelRoute.mutateAsync(plan.planId);
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push('/dispatcher/smart-routes');
      }
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="space-y-4">
      {/* Top row: back + plan ID + status + activate */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {variant === 'inline' && onNewPlan ? (
            <Button variant="ghost" size="sm" onClick={onNewPlan}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              New Plan
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  router.push('/dispatcher/smart-routes');
                }
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <h1 className="text-lg md:text-xl font-semibold text-foreground">{plan.planId}</h1>
          {isRelay && (
            <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs">Relay</Badge>
          )}
          <Badge variant={statusVariant(currentStatus)} className={statusBadgeClassName(currentStatus)}>
            {currentStatus}
          </Badge>
          {!plan.isFeasible && <Badge variant="destructive">infeasible</Badge>}
        </div>

        {currentStatus === 'ACTIVE' ? (
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" loading={replanRoute.isPending}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Replan
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Replan this route?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will generate a new optimized plan based on current conditions and mark this plan as
                    superseded.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        const result = await replanRoute.mutateAsync({
                          planId: plan.planId,
                          reason: 'Dispatcher-initiated replan',
                        });
                        router.push(`/dispatcher/smart-routes/${result.planId}`);
                      } catch {
                        // Error handled by mutation
                      }
                    }}
                  >
                    Replan Route
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : currentStatus === 'DRAFT' ? (
          <div className="flex items-center gap-2">
            {/* Discard */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-critical border-critical/20 hover:bg-critical/10"
                  loading={cancelRoute.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Discard
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard this plan?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will cancel route {plan.planId}. The loads will remain available for a new plan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Plan</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDiscard} className="bg-critical hover:bg-critical/90 text-white">
                    Discard
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Activate or Assign & Activate */}
            {onAssign ? (
              <Button loading={isAssigning} onClick={onAssign} disabled={!plan.isFeasible}>
                Assign & Activate
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button loading={activateRoute.isPending}>
                    {isRelay ? 'Activate All Routes' : 'Activate Route'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {isRelay ? 'Activate all relay routes?' : 'Activate this route?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {isRelay
                        ? `This will activate all ${plan.relayLegs?.length} leg routes for relay plan ${plan.planId} and deactivate any currently active routes for those drivers.`
                        : `This will activate route ${plan.planId} and deactivate any currently active route for this driver.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleActivate}>Activate</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ) : null}
      </div>

      {/* Context card: driver, vehicle, departure, priority, preferences + stats */}
      <Card>
        <CardContent className="py-3 px-4">
          {/* Row 1: Driver · Vehicle · Departure → Arrival · Priority — spread across */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {plan.driver && (
              <div>
                <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-0.5">Driver</div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{plan.driver.name}</span>
                </div>
              </div>
            )}
            {plan.vehicle && (
              <div>
                <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-0.5">Vehicle</div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>#{plan.vehicle.unitNumber}</span>
                </div>
              </div>
            )}
            <div>
              <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-0.5">Schedule</div>
              <div className="flex items-center gap-1.5 text-foreground">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {formatTimestamp(plan.departureTime, DISPLAY_FORMATS.COMPACT_DATE_TIME)}
                  {plan.estimatedArrival && (
                    <>
                      {' → '}
                      {formatTimestamp(plan.estimatedArrival, DISPLAY_FORMATS.COMPACT_DATE_TIME)}
                    </>
                  )}
                </span>
              </div>
            </div>
            <div>
              <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-0.5">Priority</div>
              <div className="flex items-center gap-1.5 text-foreground">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatPriority(plan.optimizationPriority)}</span>
              </div>
            </div>
          </div>

          {/* Preferences pills */}
          {(params || onToggleWhatIf) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {params?.preferredRestType && (
                <Badge variant="outline" className="text-2xs px-2 py-0 font-normal">
                  {formatRestType(params.preferredRestType)}
                </Badge>
              )}
              {params?.avoidTollRoads && (
                <Badge variant="outline" className="text-2xs px-2 py-0 font-normal">
                  Avoid tolls
                </Badge>
              )}
              {params?.maxDetourMilesForFuel && (
                <Badge variant="outline" className="text-2xs px-2 py-0 font-normal">
                  Max {params.maxDetourMilesForFuel}mi fuel detour
                </Badge>
              )}
              {onToggleWhatIf && (
                <Badge
                  variant="outline"
                  className={`text-2xs px-2 py-0 font-normal cursor-pointer hover:bg-muted/50 transition-colors ${
                    showWhatIf ? 'bg-accent/10 border-accent text-accent' : ''
                  }`}
                  onClick={onToggleWhatIf}
                >
                  What if?
                </Badge>
              )}
            </div>
          )}

          <Separator className="my-3" />

          {/* Stats strip — spread across */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="font-semibold text-foreground">
                {plan.totalDistanceMiles.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-muted-foreground ml-1">mi</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">{formatHours(plan.totalTripTimeHours)}</span>
              <span className="text-muted-foreground ml-1">trip</span>
            </div>
            {plan.totalTripTimeHours >= 24 && (
              <div>
                <span className="font-semibold text-foreground">{plan.totalDrivingDays}</span>
                <span className="text-muted-foreground ml-1">{plan.totalDrivingDays === 1 ? 'day' : 'days'}</span>
              </div>
            )}
            <div
              className={`${plan.costBreakdown ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
              onClick={() => plan.costBreakdown && setShowCostBreakdown(!showCostBreakdown)}
            >
              <span className="font-semibold text-foreground">
                ~$
                {(
                  plan.costBreakdown?.totalOperatingCost ||
                  plan.totalCostEstimate ||
                  Math.round(plan.totalDriveTimeHours * 25)
                ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-muted-foreground ml-1">est.</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 font-normal">
                Dispatcher
              </Badge>
            </div>
            {/* ETA Buffer */}
            {etaBuffer !== null && (
              <div>
                <span
                  className={`font-semibold ${
                    etaBuffer >= 60
                      ? 'text-emerald-500 dark:text-emerald-400'
                      : etaBuffer >= 30
                        ? 'text-caution'
                        : etaBuffer < 0
                          ? 'text-critical font-bold'
                          : 'text-critical'
                  }`}
                >
                  {etaBuffer < 0 ? 'LATE' : formatHours(etaBuffer / 60)}
                </span>
                <span className="text-muted-foreground ml-1">buffer</span>
              </div>
            )}
          </div>

          {/* Cost Breakdown — expandable */}
          {showCostBreakdown && plan.costBreakdown && (
            <div className="mt-3">
              <CostBreakdownPanel costBreakdown={plan.costBreakdown} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

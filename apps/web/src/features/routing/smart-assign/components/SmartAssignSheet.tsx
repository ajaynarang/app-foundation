'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, Pencil } from 'lucide-react';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { formatHOSHours } from '@/shared/lib/format-time';
import { Button } from '@sally/ui/components/ui/button';
import { Separator } from '@sally/ui/components/ui/separator';
import { Badge } from '@sally/ui/components/ui/badge';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import {
  useGenerateRoute,
  useSmartAssign,
  useSmartAssignRelay,
  useDiscardDraft,
  useDriverRecommendations,
} from '@/features/routing/smart-assign';
import { loadsApi } from '@/features/fleet/loads/api';
import { useVehicles } from '@/features/fleet/vehicles';
import { queryKeys } from '@/shared/constants';
import { DriverRecommendationList } from './DriverRecommendationList';
import { deriveDefaultDeparture, isoToLocalInputFormat, type DepartureSuggestion } from '../lib/derive-departure';
import { VehicleAutoSelect } from './VehicleAutoSelect';
import { TrailerAutoSelect } from './TrailerAutoSelect';
import { RelayLegCards } from './RelayLegCards';
import { RouteOptionsPanel } from './RouteOptionsPanel';
import { ProgressiveRouteLoading } from './ProgressiveRouteLoading';
import type { RoutePlanResult } from '@/features/routing/route-planning/types';
import type { GenerateRouteParams, DriverRecommendation } from '@/features/routing/smart-assign';

// ---- Types ----

type Step = 'select' | 'generating';

export interface SmartAssignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string;
  referenceNumber?: string;
  loadRoute: string;
  loadMiles: number;
  loadEquipmentType: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  pickupDate?: string;
  rate?: string;
  weight?: string;
  onAssigned: () => void;
  onNextLoad?: () => void;
}

// ---- Load context bar ----

interface LoadContextBarProps {
  loadNumber: string;
  referenceNumber?: string;
  loadRoute: string;
  pickupDate?: string;
  rate?: string;
  weight?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
}

function formatWindow(start?: string, end?: string): string {
  if (!start || !end) return '';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function LoadContextBar({
  loadNumber,
  referenceNumber,
  loadRoute,
  pickupDate,
  rate,
  weight,
  deliveryWindowStart,
  deliveryWindowEnd,
}: LoadContextBarProps) {
  const window = formatWindow(deliveryWindowStart, deliveryWindowEnd);

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground truncate">{loadRoute}</p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant="outline" className="text-2xs">
            #{loadNumber}
          </Badge>
          {referenceNumber && (
            <Badge variant="outline" className="text-2xs">
              PO: {referenceNumber}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {pickupDate && (
          <span>
            Pickup:{' '}
            {new Date(pickupDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
        {window && <span>Del. window: {window}</span>}
        {rate && <span>Rate: {rate}</span>}
        {weight && <span>{weight}</span>}
      </div>
    </div>
  );
}

// ---- Collapsed driver summary ----

interface CollapsedDriverSummaryProps {
  driverName: string;
  driverInitials: string;
  vehicleNumber?: string;
  hosHours: number;
  params: GenerateRouteParams;
  onEdit: () => void;
}

function CollapsedDriverSummary({
  driverName,
  driverInitials,
  vehicleNumber,
  hosHours,
  params,
  onEdit,
}: CollapsedDriverSummaryProps) {
  const priorityLabel: Record<GenerateRouteParams['optimizationPriority'], string> = {
    minimize_time: 'Fastest',
    minimize_cost: 'Cheapest',
    balance: 'Balanced',
  };

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 flex items-center gap-3">
      {/* Avatar */}
      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xs font-semibold text-foreground">
        {driverInitials}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{driverName}</p>
        <p className="text-[11px] text-muted-foreground">
          {vehicleNumber && `#${vehicleNumber} · `}
          HOS {formatHOSHours(hosHours)} remaining
          {' · '}
          {priorityLabel[params.optimizationPriority]}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
        onClick={onEdit}
      >
        <Pencil className="h-3 w-3" />
        Edit
      </Button>
    </div>
  );
}

// ---- Default route params ----

interface DefaultParamsInput {
  driverId: string;
  vehicleId: string;
  pickupDate?: string | null;
  driverDistanceMilesFromPickup?: number | null;
  /** Injectable for tests */
  now?: Date;
}

function defaultParams(input: DefaultParamsInput): GenerateRouteParams {
  const suggestion = deriveDefaultDeparture({
    firstPickupApptStart: input.pickupDate ? new Date(input.pickupDate) : null,
    driverDistanceMilesFromPickup: input.driverDistanceMilesFromPickup,
    now: input.now,
  });

  return {
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    departureTime: isoToLocalInputFormat(suggestion.isoTime),
    optimizationPriority: 'balance',
    restPreference: 'auto',
    avoidTolls: false,
    maxFuelDetourMiles: 5,
  };
}

// ---- Main SmartAssignSheet ----

export function SmartAssignSheet({
  open,
  onOpenChange,
  loadId,
  loadNumber,
  loadRoute,
  referenceNumber,
  loadMiles,
  loadEquipmentType,
  deliveryWindowStart = '',
  deliveryWindowEnd = '',
  pickupDate,
  rate,
  weight,
  onAssigned,
  onNextLoad,
}: SmartAssignSheetProps) {
  const { hasFeature } = usePlan();
  const isPremium = hasFeature('route_planning');

  // Step state
  const [step, setStep] = useState<Step>('select');

  // Selection state
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  const [routeParams, setRouteParams] = useState<GenerateRouteParams | null>(null);

  // Generated plan
  const [plan, setPlan] = useState<RoutePlanResult | null>(null);

  // Relay detection — fetch load detail to check isRelay
  const { data: loadDetail } = useQuery({
    queryKey: queryKeys.loads.detail(loadId),
    queryFn: () => loadsApi.getById(loadId),
    enabled: !!loadId && open,
  });
  const isRelay = loadDetail?.isRelay ?? false;
  const loadDetailLegs = loadDetail?.legs;
  const loadLegs = useMemo(() => loadDetailLegs ?? [], [loadDetailLegs]);
  const loadStops = loadDetail?.stops ?? [];

  // Relay: per-leg driver/vehicle selections
  const [selectedLegDrivers, setSelectedLegDrivers] = useState<
    Record<string, { driverId: string; vehicleId?: string }>
  >({});

  // Vehicles for relay leg cards
  const { data: vehiclesList } = useVehicles();
  const availableVehicles = useMemo(
    () =>
      (vehiclesList ?? [])
        .filter((v) => v.lifecycleStatus === 'ACTIVE')
        .map((v) => ({
          vehicleId: v.vehicleId,
          unitNumber: v.unitNumber,
          equipmentType: v.equipmentType ?? undefined,
        })),
    [vehiclesList],
  );

  // Mutations
  const generateRoute = useGenerateRoute();
  const smartAssign = useSmartAssign();
  const smartAssignRelay = useSmartAssignRelay();
  const discardDraft = useDiscardDraft();

  // Driver data for collapsed summary + InfeasibleState
  const { data: recommendationsData } = useDriverRecommendations(loadId);
  const recommendations: DriverRecommendation[] = recommendationsData?.recommendations ?? [];
  const selectedRec = recommendations.find((r) => r.driverId === selectedDriverId);

  // ─── Departure-suggestion driver (handles relay correctly) ────────────────
  // In standard mode the suggestion driver is selectedDriverId.
  // In relay mode it's leg-1's driver — that driver runs the deadhead to first pickup,
  // so leg-1's proximity is what determines the suggested departure (not selectedDriverId,
  // which lives in the non-relay flow).
  const firstLegDriverId = useMemo(() => {
    if (!isRelay) return null;
    const firstLeg = loadLegs[0];
    if (!firstLeg) return null;
    return selectedLegDrivers[firstLeg.legId]?.driverId ?? null;
  }, [isRelay, loadLegs, selectedLegDrivers]);

  const suggestionDistanceMiles = useMemo(() => {
    if (isRelay) {
      if (!firstLegDriverId) return null;
      return recommendations.find((r) => r.driverId === firstLegDriverId)?.proximity?.distanceMilesFromPickup ?? null;
    }
    return selectedRec?.proximity?.distanceMilesFromPickup ?? null;
  }, [isRelay, firstLegDriverId, recommendations, selectedRec?.proximity?.distanceMilesFromPickup]);

  // Suggested departure — drives the form default and the inline "Suggested" hint
  // when the dispatcher overrides earlier than derived.
  const departureSuggestion: DepartureSuggestion = useMemo(
    () =>
      deriveDefaultDeparture({
        firstPickupApptStart: pickupDate ? new Date(pickupDate) : null,
        driverDistanceMilesFromPickup: suggestionDistanceMiles,
      }),
    [pickupDate, suggestionDistanceMiles],
  );

  // Merge params with latest driver/vehicle selection
  const effectiveParams: GenerateRouteParams | null = useMemo(
    () =>
      selectedDriverId && selectedVehicleId
        ? {
            ...(routeParams ??
              defaultParams({
                driverId: selectedDriverId,
                vehicleId: selectedVehicleId,
                pickupDate,
                driverDistanceMilesFromPickup: suggestionDistanceMiles,
              })),
            driverId: selectedDriverId,
            vehicleId: selectedVehicleId,
          }
        : null,
    [selectedDriverId, selectedVehicleId, routeParams, pickupDate, suggestionDistanceMiles],
  );

  const canGenerate = !!selectedDriverId && !!selectedVehicleId;

  // ---- Reset state when the load changes (e.g. Assign & Next) ----
  useEffect(() => {
    setStep('select');
    setPlan(null);
    setSelectedDriverId(null);
    setSelectedVehicleId(null);
    setSelectedTrailerId(null);
    setSelectedLegDrivers({});
  }, [loadId]);

  // ---- Discard draft helper ----
  const discardCurrentDraft = useCallback(() => {
    if (plan?.planId) {
      discardDraft.mutate(plan.planId);
    }
    setPlan(null);
  }, [plan, discardDraft]);

  // ---- Handlers ----

  const handleDriverSelect = useCallback((driverId: string) => {
    setSelectedDriverId(driverId);
    // Reset vehicle, params, and trailer so the new driver's dedicated truck auto-pairs
    setSelectedVehicleId(null);
    setRouteParams(null);
    setSelectedTrailerId(null);
  }, []);

  // ---- Relay leg driver selection ----
  const handleLegDriverSelect = useCallback((legId: string, driverId: string, vehicleId?: string) => {
    setSelectedLegDrivers((prev) => ({
      ...prev,
      [legId]: { driverId, vehicleId },
    }));
  }, []);

  // Check if all relay legs have drivers assigned
  const allLegsAssigned =
    isRelay && loadLegs.length > 0
      ? loadLegs.every((leg) => {
          const sel = selectedLegDrivers[leg.legId];
          return sel?.driverId;
        })
      : false;

  // Adjacent-driver duplicate detection for button disabling (I2)
  const hasAdjacentDuplicates = useMemo(() => {
    if (!isRelay || loadLegs.length < 2) return false;
    const sorted = [...loadLegs].sort((a, b) => a.sequence - b.sequence);
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentSel = selectedLegDrivers[sorted[i].legId];
      const nextSel = selectedLegDrivers[sorted[i + 1].legId];
      if (currentSel?.driverId && nextSel?.driverId && currentSel.driverId === nextSel.driverId) {
        return true;
      }
    }
    return false;
  }, [isRelay, loadLegs, selectedLegDrivers]);

  // ---- Relay assign all legs ----
  const handleRelayAssign = useCallback(
    (andNext: boolean) => {
      if (!allLegsAssigned) return;
      const assignments = Object.entries(selectedLegDrivers).map(([legId, sel]) => ({
        legId,
        driverId: sel.driverId,
        vehicleId: sel.vehicleId,
      }));
      smartAssignRelay.mutate(
        { loadId, assignments },
        {
          onSuccess: () => {
            onAssigned();
            if (andNext && onNextLoad) {
              onNextLoad();
            } else {
              onOpenChange(false);
            }
          },
        },
      );
    },
    [allLegsAssigned, selectedLegDrivers, smartAssignRelay, loadId, onAssigned, onNextLoad, onOpenChange],
  );

  const handleParamsChange = useCallback(
    (partial: Partial<GenerateRouteParams>) => {
      setRouteParams((prev) =>
        prev
          ? { ...prev, ...partial }
          : {
              ...defaultParams({
                driverId: selectedDriverId ?? '',
                vehicleId: selectedVehicleId ?? '',
                pickupDate,
                driverDistanceMilesFromPickup: suggestionDistanceMiles,
              }),
              ...partial,
            },
      );
    },
    [selectedDriverId, selectedVehicleId, pickupDate, selectedRec?.proximity?.distanceMilesFromPickup],
  );

  const router = useRouter();

  const handleGenerateRoute = useCallback(async () => {
    if (isRelay) {
      // Relay mode: use first leg's driver for route generation params,
      // and pass legDriverMap for per-leg routing
      if (!allLegsAssigned) return;
      const firstLeg = loadLegs[0];
      const firstSel = selectedLegDrivers[firstLeg?.legId];
      if (!firstSel) return;

      const legDriverMap: Record<string, { driverId: string; vehicleId: string }> = {};
      for (const [legId, sel] of Object.entries(selectedLegDrivers)) {
        if (sel.vehicleId) {
          legDriverMap[legId] = { driverId: sel.driverId, vehicleId: sel.vehicleId };
        } else {
          legDriverMap[legId] = { driverId: sel.driverId, vehicleId: '' };
        }
      }

      const baseParams =
        routeParams ??
        defaultParams({
          driverId: firstSel.driverId,
          vehicleId: firstSel.vehicleId ?? '',
          pickupDate,
          driverDistanceMilesFromPickup: suggestionDistanceMiles,
        });
      const params = { ...baseParams, driverId: firstSel.driverId, vehicleId: firstSel.vehicleId ?? '' };
      setStep('generating');

      generateRoute.mutate(
        { loadId, params: { ...params, legDriverMap } },
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onSuccess: (result: any) => {
            setPlan(result);
            onOpenChange(false);
            // Relay returns { type: 'relay', legs: [{ planId, ... }] }
            // Navigate to the first leg's plan
            const planId = result.type === 'relay' && result.legs?.length > 0 ? result.legs[0].planId : result.planId;
            if (planId) {
              router.push(`/dispatcher/smart-routes/${planId}?assign=true&loadId=${loadId}`);
            }
          },
          onError: () => {
            setStep('select');
          },
        },
      );
    } else {
      // Standard mode
      if (!effectiveParams) return;
      setStep('generating');

      generateRoute.mutate(
        { loadId, params: effectiveParams },
        {
          onSuccess: (result: RoutePlanResult) => {
            setPlan(result);
            // Navigate to full plan detail page with assign context
            // The plan page will show "Assign & Activate" instead of just "Activate"
            onOpenChange(false);
            router.push(`/dispatcher/smart-routes/${result.planId}?assign=true&loadId=${loadId}`);
          },
          onError: () => {
            setStep('select');
          },
        },
      );
    }
  }, [
    isRelay,
    allLegsAssigned,
    loadLegs,
    selectedLegDrivers,
    effectiveParams,
    generateRoute,
    loadId,
    onOpenChange,
    router,
    routeParams,
  ]);

  const handleBasicAssign = useCallback(
    async (andNext: boolean) => {
      if (!selectedDriverId || !selectedVehicleId) return;
      smartAssign.mutate(
        {
          loadId,
          driverId: selectedDriverId,
          vehicleId: selectedVehicleId,
          ...(selectedTrailerId ? { trailerId: selectedTrailerId } : {}),
        },
        {
          onSuccess: () => {
            onAssigned();
            if (andNext && onNextLoad) {
              onNextLoad();
            } else {
              onOpenChange(false);
            }
          },
        },
      );
    },
    [loadId, selectedDriverId, selectedVehicleId, selectedTrailerId, smartAssign, onAssigned, onNextLoad, onOpenChange],
  );

  const handleEditFromSummary = useCallback(() => {
    discardCurrentDraft();
    setStep('select');
  }, [discardCurrentDraft]);

  const handleCancel = useCallback(() => {
    discardCurrentDraft();
    onOpenChange(false);
  }, [discardCurrentDraft, onOpenChange]);

  const isAssigning = smartAssign.isPending || smartAssignRelay.isPending;

  // Step-specific footer buttons passed to FormSheet as footerExtra
  const stepFooter = (
    <div className="flex items-center gap-2 w-full safe-area-bottom">
      {/* ---- select step footer ---- */}
      {step === 'select' && (
        <>
          <Button variant="outline" onClick={handleCancel} className="flex-shrink-0">
            Cancel
          </Button>
          <div className="flex-1" />
          {isPremium ? (
            isRelay ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  disabled={!allLegsAssigned || hasAdjacentDuplicates || isAssigning || generateRoute.isPending}
                  loading={smartAssignRelay.isPending}
                  onClick={() => handleRelayAssign(false)}
                >
                  Assign All Legs
                </Button>
                <Button
                  disabled={!allLegsAssigned || hasAdjacentDuplicates || generateRoute.isPending || isAssigning}
                  loading={generateRoute.isPending}
                  onClick={handleGenerateRoute}
                >
                  Generate Routes
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  disabled={!canGenerate || isAssigning || generateRoute.isPending}
                  loading={smartAssign.isPending}
                  onClick={() => handleBasicAssign(false)}
                >
                  Just Assign
                </Button>
                <Button
                  disabled={!canGenerate || generateRoute.isPending || isAssigning}
                  loading={generateRoute.isPending}
                  onClick={handleGenerateRoute}
                >
                  Generate Route
                </Button>
              </>
            )
          ) : isRelay ? (
            <>
              <Button
                variant="outline"
                disabled={!allLegsAssigned || hasAdjacentDuplicates || isAssigning}
                loading={smartAssignRelay.isPending}
                onClick={() => handleRelayAssign(false)}
              >
                Assign All Legs
              </Button>
              {onNextLoad && (
                <Button
                  disabled={!allLegsAssigned || hasAdjacentDuplicates || isAssigning}
                  loading={isAssigning}
                  onClick={() => handleRelayAssign(true)}
                >
                  Assign &amp; Next →
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={!canGenerate || isAssigning}
                loading={isAssigning && !smartAssign.isPending}
                onClick={() => handleBasicAssign(false)}
              >
                Assign &amp; Close
              </Button>
              {onNextLoad && (
                <Button
                  disabled={!canGenerate || isAssigning}
                  loading={isAssigning}
                  onClick={() => handleBasicAssign(true)}
                >
                  Assign &amp; Next →
                </Button>
              )}
            </>
          )}
        </>
      )}

      {/* ---- generating step footer ---- */}
      {step === 'generating' && (
        <>
          <Button variant="outline" onClick={handleCancel} className="flex-shrink-0">
            Cancel
          </Button>
          <div className="flex-1" />
          <Button disabled loading={false}>
            Assign &amp; Activate
          </Button>
        </>
      )}
    </div>
  );

  const stepDescription = step === 'select' ? 'Select driver and vehicle' : 'Generating smart route…';

  // ---- Premium stepper ----
  const stepperSteps: { key: Step; label: string }[] = [
    { key: 'select', label: 'Select' },
    { key: 'generating', label: 'Generate' },
  ];
  const stepIndex = stepperSteps.findIndex((s) => s.key === step);

  return (
    <FormSheet
      open={open}
      onOpenChange={step === 'generating' ? () => {} : onOpenChange}
      title="Smart Assign"
      description={stepDescription}
      mode="view"
      side="right"
      pinnable
      resizable
      footerExtra={stepFooter}
    >
      <div className="space-y-4">
        {/* ---- Premium stepper ---- */}
        {isPremium && (
          <div className="flex items-center justify-center gap-0">
            {stepperSteps.map((s, i) => {
              const isCompleted = i < stepIndex;
              const isActive = i === stepIndex;
              return (
                <div key={s.key} className="flex items-center">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={
                        isCompleted
                          ? 'h-4 w-4 rounded-full bg-green-500 flex items-center justify-center'
                          : isActive
                            ? 'h-4 w-4 rounded-full bg-accent border-2 border-accent'
                            : 'h-4 w-4 rounded-full border-2 border-muted-foreground/30'
                      }
                    >
                      {isCompleted && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>
                    <span
                      className={isActive ? 'text-2xs font-medium text-foreground' : 'text-2xs text-muted-foreground'}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < stepperSteps.length - 1 && (
                    <div
                      className={
                        i < stepIndex ? 'w-10 h-px bg-green-500/50 mx-1 mb-3' : 'w-10 h-px bg-border mx-1 mb-3'
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Load context bar — always visible ---- */}
        <LoadContextBar
          loadNumber={loadNumber}
          referenceNumber={referenceNumber}
          loadRoute={loadRoute}
          pickupDate={pickupDate}
          rate={rate}
          weight={weight}
          deliveryWindowStart={deliveryWindowStart}
          deliveryWindowEnd={deliveryWindowEnd}
        />

        {/* ---- STEP: select ---- */}
        {step === 'select' && (
          <>
            <Separator />

            {isRelay ? (
              loadLegs.length === 0 ? (
                /* Relay-with-no-legs guardrail. The detail panel's primary CTA
                   is supposed to flip to "Configure Legs" before reaching this
                   sheet — this is defense in depth if anything else opens it. */
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <p className="text-sm font-medium text-foreground mb-1">No relay legs configured yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    This is a relay load, but exchange points haven't been set. Close this sheet and configure relay
                    legs from the load detail panel before assigning drivers.
                  </p>
                </div>
              ) : (
                /* Relay mode: per-leg driver/vehicle selection */
                <RelayLegCards
                  legs={loadLegs}
                  stops={loadStops}
                  drivers={recommendations}
                  selectedDrivers={selectedLegDrivers}
                  onDriverSelect={handleLegDriverSelect}
                  vehicles={availableVehicles}
                />
              )
            ) : (
              /* Standard mode: single driver + vehicle */
              <>
                <DriverRecommendationList
                  loadId={loadId}
                  selectedDriverId={selectedDriverId}
                  onSelectDriver={handleDriverSelect}
                />

                <VehicleAutoSelect
                  loadId={loadId}
                  selectedDriverId={selectedDriverId}
                  selectedVehicleId={selectedVehicleId}
                  onSelectVehicle={setSelectedVehicleId}
                  loadEquipmentType={loadEquipmentType}
                />

                <TrailerAutoSelect
                  selectedVehicleId={selectedVehicleId}
                  selectedTrailerId={selectedTrailerId}
                  onSelectTrailer={setSelectedTrailerId}
                  loadEquipmentType={loadEquipmentType}
                  hidden={loadEquipmentType === 'POWER_ONLY'}
                />
              </>
            )}

            {isPremium && (isRelay ? allLegsAssigned : effectiveParams) && (
              <>
                <Separator />
                <RouteOptionsPanel
                  params={
                    isRelay
                      ? (() => {
                          const firstLeg = loadLegs[0];
                          const firstSel = firstLeg ? selectedLegDrivers[firstLeg.legId] : undefined;
                          return firstSel
                            ? (routeParams ??
                                defaultParams({
                                  driverId: firstSel.driverId,
                                  vehicleId: firstSel.vehicleId ?? '',
                                  pickupDate,
                                  driverDistanceMilesFromPickup: suggestionDistanceMiles,
                                }))
                            : defaultParams({
                                driverId: '',
                                vehicleId: '',
                                pickupDate,
                                driverDistanceMilesFromPickup: suggestionDistanceMiles,
                              });
                        })()
                      : effectiveParams!
                  }
                  onChange={handleParamsChange}
                  departureSuggestion={departureSuggestion}
                />
              </>
            )}
          </>
        )}

        {/* ---- STEP: generating ---- */}
        {step === 'generating' && (
          <>
            {selectedRec && effectiveParams && (
              <CollapsedDriverSummary
                driverName={selectedRec.name}
                driverInitials={selectedRec.initials}
                vehicleNumber={selectedRec.vehicle?.unitNumber}
                hosHours={selectedRec.hos.driveHoursRemaining}
                params={effectiveParams}
                onEdit={handleEditFromSummary}
              />
            )}

            <Separator />

            <ProgressiveRouteLoading
              driverHOSHours={selectedRec?.hos.driveHoursRemaining ?? 11}
              loadMiles={loadMiles}
            />
          </>
        )}
      </div>
    </FormSheet>
  );
}

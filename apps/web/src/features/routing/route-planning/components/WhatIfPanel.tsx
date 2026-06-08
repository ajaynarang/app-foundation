'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Slider } from '@sally/ui/components/ui/slider';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showError } from '@sally/ui';
import type { RoutePlanResult, RoutePlanPreviewResult } from '../types';
import { useRequestReplan } from '../hooks/use-driver-route-plan';
import { routePlanningApi } from '../api';
import { formatHours } from './plan-utils';

interface WhatIfPanelProps {
  plan: RoutePlanResult;
  onClose: () => void;
}

const REST_OPTIONS = [
  { value: 'split_8_2', label: 'Split 8/2' },
  { value: 'full', label: 'Full 10h' },
  { value: 'split_7_3', label: 'Split 7/3' },
] as const;

export function WhatIfPanel({ plan, onClose }: WhatIfPanelProps) {
  const [departureOffset, setDepartureOffset] = useState(0); // 30-min steps (-8 to +8)
  const [restType, setRestType] = useState<string>(plan.dispatcherParams?.preferredRestType || 'auto');
  const [preview, setPreview] = useState<RoutePlanPreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const replanRoute = useRequestReplan();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  // Fetch a REAL preview from the engine whenever a param changes (debounced).
  // No client-side heuristic — the dispatcher sees the actual simulated delta.
  useEffect(() => {
    const changed = departureOffset !== 0 || restType !== (plan.dispatcherParams?.preferredRestType || 'auto');
    if (!changed) {
      setPreview(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      setIsPreviewing(true);
      routePlanningApi
        .preview(plan.planId, {
          preferredRestType: restType,
          departureTimeShiftHours: departureOffset * 0.5,
        })
        .then((result) => {
          if (reqId === reqIdRef.current) setPreview(result);
        })
        .catch((err) => {
          if (reqId === reqIdRef.current) {
            setPreview(null);
            showError('Could not preview the change', err instanceof Error ? err.message : undefined);
          }
        })
        .finally(() => {
          if (reqId === reqIdRef.current) setIsPreviewing(false);
        });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [departureOffset, restType, plan.planId, plan.dispatcherParams?.preferredRestType]);

  // Real deltas vs the current plan (positive = more time/cost than today).
  const tripDelta = preview ? preview.totalTripTimeHours - plan.totalTripTimeHours : 0;
  const costDelta = preview ? preview.totalCostEstimate - plan.totalCostEstimate : 0;

  const handleRegenerate = async () => {
    try {
      await replanRoute.mutateAsync({
        planId: plan.planId,
        reason: `What-if: departure ${departureOffset > 0 ? '+' : ''}${departureOffset * 30}min, rest: ${restType}`,
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const formatOffset = (offset: number) => {
    const minutes = offset * 30;
    if (minutes === 0) return 'Current';
    const sign = minutes > 0 ? '+' : '';
    if (Math.abs(minutes) >= 60) {
      const h = Math.floor(Math.abs(minutes) / 60);
      const m = Math.abs(minutes) % 60;
      return `${sign}${minutes < 0 ? '-' : ''}${h}h${m > 0 ? ` ${m}m` : ''}`;
    }
    return `${sign}${minutes}m`;
  };

  const deltaColor = (delta: number) => {
    if (delta <= -0.01) return 'text-emerald-500 dark:text-emerald-400';
    if (delta >= 0.01) return 'text-critical';
    return 'text-foreground';
  };

  return (
    <Card className="animate-in fade-in slide-in-from-top-2 duration-300">
      <CardContent className="py-3 px-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground">What If?</h3>
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Departure time slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-muted-foreground">Departure</span>
            <span className="text-[11px] font-mono text-foreground">{formatOffset(departureOffset)}</span>
          </div>
          <Slider value={[departureOffset]} min={-8} max={8} step={1} onValueChange={([v]) => setDepartureOffset(v)} />
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
            <span>-4h</span>
            <span>+4h</span>
          </div>
        </div>

        {/* Rest type toggle */}
        <div>
          <span className="text-[11px] text-muted-foreground mb-2 block">Rest Type</span>
          <div className="flex gap-1">
            {REST_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={restType === opt.value ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-[11px] flex-1"
                onClick={() => setRestType(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Real impact preview from the engine */}
        <div className="bg-muted/30 rounded-md p-2.5 space-y-1.5">
          <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1.5">Estimated Impact</div>
          {isPreviewing ? (
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : !preview ? (
            <p className="text-[11px] text-muted-foreground">Adjust a setting to see the real impact.</p>
          ) : (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Trip time</span>
                <span className={`font-mono ${deltaColor(tripDelta)}`}>
                  {tripDelta > 0 ? '+' : tripDelta < 0 ? '-' : ''}
                  {Math.abs(tripDelta) >= 0.01 ? formatHours(Math.abs(tripDelta)) : 'No change'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Cost</span>
                <span className={`font-mono ${deltaColor(costDelta)}`}>
                  {costDelta > 0 ? '+' : costDelta < 0 ? '-' : ''}${Math.abs(costDelta).toFixed(2)}
                </span>
              </div>
              {!preview.isFeasible && (
                <p className="text-[11px] text-critical pt-1">⚠️ Not feasible: {preview.feasibilityIssues[0]}</p>
              )}
            </>
          )}
        </div>

        <Button size="sm" className="w-full h-8 text-xs" onClick={handleRegenerate} loading={replanRoute.isPending}>
          Apply &amp; Regenerate
        </Button>
      </CardContent>
    </Card>
  );
}

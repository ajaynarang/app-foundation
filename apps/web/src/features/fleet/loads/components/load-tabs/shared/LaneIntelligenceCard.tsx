'use client';

import { useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, Pencil, X, Check, Target } from 'lucide-react';
import { cn } from '@sally/ui';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import {
  useLaneIntelligence,
  useUpsertLaneRateTarget,
  useDeleteLaneRateTarget,
} from '@/features/fleet/loads/hooks/use-lane-rate';
import type { LaneRateTrend } from '@sally/shared-types';

// ── Props ──

interface LaneIntelligenceCardProps {
  originState?: string;
  destState?: string;
  equipmentType?: string;
  /** Current load/lane rate in cents (for comparison) */
  loadRateCents?: number | null;
  /** Current load/lane estimated miles (to compute $/mi) */
  loadEstimatedMiles?: number | null;
  /** Compact mode for use inside popovers */
  compact?: boolean;
}

// ── Helpers ──

function centsPerMileToDollars(centsPerMile: number): string {
  return (centsPerMile / 100).toFixed(2);
}

function computeLoadRateCentsPerMile(rateCents?: number | null, miles?: number | null): number | null {
  if (!rateCents || !miles || miles <= 0) return null;
  return Math.round(rateCents / miles);
}

const TREND_CONFIG: Record<LaneRateTrend, { icon: typeof TrendingUp; label: string; className: string }> = {
  up: { icon: TrendingUp, label: 'Trending up', className: 'text-muted-foreground' },
  down: { icon: TrendingDown, label: 'Trending down', className: 'text-muted-foreground' },
  flat: { icon: Minus, label: 'Stable', className: 'text-muted-foreground' },
};

// ── Component ──

export function LaneIntelligenceCard({
  originState,
  destState,
  equipmentType,
  loadRateCents,
  loadEstimatedMiles,
  compact,
}: LaneIntelligenceCardProps) {
  // Don't render if we can't determine the lane
  if (!originState || !destState) return null;

  return (
    <LaneIntelligenceCardInner
      originState={originState}
      destState={destState}
      equipmentType={equipmentType}
      loadRateCents={loadRateCents}
      loadEstimatedMiles={loadEstimatedMiles}
      compact={compact}
    />
  );
}

function LaneIntelligenceCardInner({
  originState,
  destState,
  equipmentType,
  loadRateCents,
  loadEstimatedMiles,
  compact,
}: {
  originState: string;
  destState: string;
  equipmentType?: string;
  loadRateCents?: number | null;
  loadEstimatedMiles?: number | null;
  compact?: boolean;
}) {
  const { data, isLoading } = useLaneIntelligence(originState, destState, equipmentType);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-3 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const { computed, target } = data ?? { computed: null, target: null };

  // ── No data state ──
  if (!computed && !target) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lane Intelligence</span>
        </div>
        <p className="text-sm text-muted-foreground">
          No rate history for {originState} → {destState} yet.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Complete more loads on this lane to build rate intelligence.
        </p>
        <TargetRateEditor
          originState={originState}
          destState={destState}
          equipmentType={equipmentType}
          target={null}
          compact={compact}
        />
      </div>
    );
  }

  // ── Data state (high or low confidence) ──
  const loadCentsPerMile = computeLoadRateCentsPerMile(loadRateCents, loadEstimatedMiles);

  // Determine comparison anchor: target if set, otherwise computed avg
  const anchorCentsPerMile = target?.targetRateCentsPerMile ?? computed?.avgRateCentsPerMile;
  const anchorLabel = target ? 'your target' : 'your avg';

  let comparison: { pctDiff: number; label: string; className: string } | null = null;
  if (loadCentsPerMile && anchorCentsPerMile && anchorCentsPerMile > 0) {
    const pctDiff = Math.round(((loadCentsPerMile - anchorCentsPerMile) / anchorCentsPerMile) * 100);
    comparison = {
      pctDiff,
      label: `${pctDiff > 0 ? '+' : ''}${pctDiff}% vs ${anchorLabel}`,
      className: 'text-muted-foreground',
    };
  }

  const isLowConfidence = computed?.confidence === 'low';
  const TrendIcon = computed ? TREND_CONFIG[computed.trend].icon : Minus;

  return (
    <div className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lane Intelligence</span>
        {computed && (
          <Badge variant="outline" className="ml-auto text-2xs h-5 text-muted-foreground">
            {isLowConfidence ? 'Limited data' : 'High confidence'}
          </Badge>
        )}
      </div>

      {/* Computed stats */}
      {computed && (
        <div className="space-y-1">
          <div className="text-sm text-foreground">
            Your avg: <span className="font-medium">${centsPerMileToDollars(computed.avgRateCentsPerMile)}/mi</span>
            <span className="text-muted-foreground text-xs ml-1">({computed.loadCount} loads, 90d)</span>
          </div>

          {/* This load comparison */}
          {loadCentsPerMile && comparison && (
            <div className="text-sm text-foreground">
              This load: ${centsPerMileToDollars(loadCentsPerMile)}/mi{' '}
              <span className={cn('font-medium', comparison.className)}>{comparison.label}</span>
            </div>
          )}

          {/* Range + Trend */}
          {!compact && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span>
                Range: ${centsPerMileToDollars(computed.minRateCentsPerMile)} – $
                {centsPerMileToDollars(computed.maxRateCentsPerMile)}/mi
              </span>
              <span className={cn('flex items-center gap-1', TREND_CONFIG[computed.trend].className)}>
                <TrendIcon className="h-3 w-3" />
                {TREND_CONFIG[computed.trend].label}
              </span>
            </div>
          )}

          {/* Low confidence warning */}
          {isLowConfidence && !compact && (
            <p className="text-xs text-muted-foreground mt-1">
              Limited sample — rate may not reflect the full picture.
            </p>
          )}
        </div>
      )}

      {/* Target rate editor */}
      <TargetRateEditor
        originState={originState}
        destState={destState}
        equipmentType={equipmentType}
        target={target}
        compact={compact}
      />
    </div>
  );
}

// ── Target Rate Inline Editor ──

function TargetRateEditor({
  originState,
  destState,
  equipmentType,
  target,
  compact,
}: {
  originState: string;
  destState: string;
  equipmentType?: string;
  target: { laneRateTargetId: string; targetRateCentsPerMile: number; setByUserName: string } | null;
  compact?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const upsertMutation = useUpsertLaneRateTarget();
  const deleteMutation = useDeleteLaneRateTarget();

  const startEdit = useCallback(() => {
    setInputValue(target ? (target.targetRateCentsPerMile / 100).toFixed(2) : '');
    setIsEditing(true);
  }, [target]);

  const handleSave = useCallback(() => {
    const dollars = parseFloat(inputValue);
    if (isNaN(dollars) || dollars <= 0) return;
    const centsPerMile = Math.round(dollars * 100);
    upsertMutation.mutate(
      {
        originState,
        destinationState: destState,
        targetRateCentsPerMile: centsPerMile,
        equipmentType,
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }, [inputValue, originState, destState, equipmentType, upsertMutation]);

  const handleDelete = useCallback(() => {
    if (!target) return;
    deleteMutation.mutate({
      id: target.laneRateTargetId,
      originState,
      destState,
    });
  }, [target, originState, destState, deleteMutation]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <Target className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">$</span>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          className="h-7 w-20 text-sm"
          autoFocus
        />
        <span className="text-xs text-muted-foreground">/mi</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={handleSave}
          loading={upsertMutation.isPending}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setIsEditing(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (target) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <Target className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm text-foreground">
          Your target: <span className="font-medium">${centsPerMileToDollars(target.targetRateCentsPerMile)}/mi</span>
        </span>
        {!compact && <span className="text-xs text-muted-foreground">set by {target.setByUserName}</span>}
        <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={startEdit}>
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={handleDelete}
          loading={deleteMutation.isPending}
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  // No target set
  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
        onClick={startEdit}
      >
        <Target className="h-3 w-3" />
        Set target rate
      </Button>
    </div>
  );
}

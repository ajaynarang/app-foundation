'use client';

import { useMemo } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { cn } from '@sally/ui';
import { Badge } from '@sally/ui/components/ui/badge';
import { LEG_STATUS_VARIANTS } from '../constants/relay';
import type { LoadLegStatus } from '@sally/shared-types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LegTimelineLeg {
  legId: string;
  sequence: number;
  status: string;
  driverName?: string | null;
  vehicleUnitNumber?: string | null;
  actualMiles?: number | null;
  assignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  originCity?: string;
  originState?: string;
  destCity?: string;
  destState?: string;
}

export interface LegTimelineProps {
  legs: LegTimelineLeg[];
  totalMiles?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) +
    ', ' +
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  );
}

function formatLocation(city?: string, state?: string): string {
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return 'TBD';
}

type StatusCategory = 'completed' | 'active' | 'pending';

function getStatusCategory(status: string): StatusCategory {
  if (status === 'DELIVERED') return 'completed';
  if (status === 'IN_TRANSIT') return 'active';
  return 'pending';
}

// ─── Dot Indicator ───────────────────────────────────────────────────────────

function LegDot({ status }: { status: string }) {
  const category = getStatusCategory(status);

  return (
    <div
      className={cn(
        'absolute -left-[1.6rem] top-[1.4rem] z-10 flex h-[10px] w-[10px] items-center justify-center rounded-full',
        category === 'completed' && 'bg-blue-500 border-2 border-blue-500',
        category === 'active' &&
          'bg-green-500 border-2 border-green-500 shadow-[0_0_8px_hsl(142_71%_45%/0.4)] animate-pulse',
        category === 'pending' && 'border-2 border-muted-foreground bg-background',
      )}
    >
      {category === 'completed' && <Check className="h-[6px] w-[6px] text-white" strokeWidth={3} />}
    </div>
  );
}

// ─── Exchange Point Divider ──────────────────────────────────────────────────

function ExchangeMarker({ city, state, timestamp }: { city?: string; state?: string; timestamp?: string | null }) {
  const location = formatLocation(city, state);
  const timeLabel = timestamp ? formatTimestamp(timestamp) : null;

  return (
    <div className="relative flex items-center gap-2 py-1 -my-1">
      <div className="flex-1 border-t-2 border-dashed border-yellow-500" />
      <span className="whitespace-nowrap rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-yellow-500">
        Exchange @ {location}
        {timeLabel && ` \u2014 ${timeLabel}`}
      </span>
      <div className="flex-1 border-t-2 border-dashed border-yellow-500" />
    </div>
  );
}

// ─── Leg Card ────────────────────────────────────────────────────────────────

function LegCard({ leg }: { leg: LegTimelineLeg }) {
  const variant = LEG_STATUS_VARIANTS[leg.status as LoadLegStatus] ?? LEG_STATUS_VARIANTS.PENDING;
  const category = getStatusCategory(leg.status);
  const origin = formatLocation(leg.originCity, leg.originState);
  const dest = formatLocation(leg.destCity, leg.destState);

  // Pick the most relevant timestamp
  const timestampLabel = useMemo(() => {
    if (leg.deliveredAt) return `Delivered: ${formatTimestamp(leg.deliveredAt)}`;
    if (leg.pickedUpAt) return `Picked up: ${formatTimestamp(leg.pickedUpAt)}`;
    if (leg.assignedAt) return `Assigned: ${formatTimestamp(leg.assignedAt)}`;
    return null;
  }, [leg.deliveredAt, leg.pickedUpAt, leg.assignedAt]);

  return (
    <div className="relative mb-3">
      <LegDot status={leg.status} />

      <div
        className={cn(
          'rounded-md border border-border bg-muted/50 p-3',
          category === 'active' && 'border-green-500/30 bg-green-500/5',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <span>Leg {leg.sequence}</span>
            <span className="text-muted-foreground">&mdash;</span>
            <span className="truncate">{origin}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{dest}</span>
          </div>

          <Badge variant="outline" className={cn('shrink-0 rounded-full text-[11px] font-medium', variant.badgeClass)}>
            {category === 'completed' && <Check className="mr-1 h-3 w-3" />}
            {variant.label}
          </Badge>
        </div>

        {/* Details */}
        <div className="mt-2 space-y-0.5 text-[12px] text-muted-foreground leading-relaxed">
          {leg.driverName && (
            <div>
              <span className="font-medium text-foreground">Driver:</span> {leg.driverName}
            </div>
          )}
          {leg.vehicleUnitNumber && (
            <div>
              <span className="font-medium text-foreground">Vehicle:</span> {leg.vehicleUnitNumber}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {leg.actualMiles != null && (
              <span>
                <span className="font-medium text-foreground">Miles:</span> {leg.actualMiles.toLocaleString()} mi
              </span>
            )}
            {timestampLabel && <span>{timestampLabel}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LegTimeline ─────────────────────────────────────────────────────────────

export function LegTimeline({ legs, totalMiles }: LegTimelineProps) {
  const sorted = useMemo(() => [...legs].sort((a, b) => a.sequence - b.sequence), [legs]);

  if (sorted.length === 0) return null;

  return (
    <div className="py-4">
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span className="text-purple-400">{'\u27D0'}</span>
          <span>Relay Legs</span>
        </div>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {sorted.length} {sorted.length === 1 ? 'leg' : 'legs'}
          {totalMiles != null && ` \u00B7 ${totalMiles.toLocaleString()} mi total`}
        </span>
      </div>

      {/* Timeline */}
      <div className="relative pl-7">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-border" />

        {sorted.map((leg, i) => (
          <div key={leg.legId}>
            <LegCard leg={leg} />

            {/* Exchange marker between legs */}
            {i < sorted.length - 1 && (
              <ExchangeMarker city={leg.destCity} state={leg.destState} timestamp={leg.deliveredAt} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

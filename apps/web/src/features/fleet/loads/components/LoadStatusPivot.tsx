'use client';

import type { LoadStatus } from '@sally/shared-types';
import { cn } from '@/shared/lib/utils';

/** The pivot's selectable scope: an active status, ALL active loads, or HISTORY. */
export type LoadPivotValue = 'ALL' | LoadStatus | 'HISTORY';

interface PivotSegment {
  value: LoadPivotValue;
  label: string;
  /** Tailwind dot color for statuses that warrant a glance signal (others have no dot). */
  dot?: string;
}

/**
 * Active-load funnel, in lifecycle order, then History after a divider. Mirrors the
 * kanban columns so the pivot reads as the same funnel the board shows.
 */
const ACTIVE_SEGMENTS: PivotSegment[] = [
  { value: 'ALL', label: 'Active', dot: 'bg-foreground' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PENDING', label: 'Pending', dot: 'bg-caution' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_TRANSIT', label: 'In Transit', dot: 'bg-info' },
  { value: 'ON_HOLD', label: 'On Hold', dot: 'bg-critical' },
];

export interface LoadStatusPivotProps {
  value: LoadPivotValue;
  onChange: (value: LoadPivotValue) => void;
  /** Live counts keyed by pivot value (e.g. { ALL: 11, PENDING: 9, HISTORY: 306 }). */
  counts: Partial<Record<LoadPivotValue, number>>;
  className?: string;
}

/**
 * LoadStatusPivot — the Loads filter-row scope control (Zone 3 of the page chrome).
 * One strip drives both Board and Table: active-status funnel + History, with live
 * counts and glance dots. Selecting History switches the page to the table data source.
 * See sally-frontend-patterns §15.4 (Page Chrome).
 */
export function LoadStatusPivot({ value, onChange, counts, className }: LoadStatusPivotProps) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto', className)} role="tablist" aria-label="Load status">
      {ACTIVE_SEGMENTS.map((seg) => (
        <PivotButton
          key={seg.value}
          segment={seg}
          active={value === seg.value}
          count={counts[seg.value]}
          onClick={onChange}
        />
      ))}
      <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
      <PivotButton
        segment={{ value: 'HISTORY', label: 'History' }}
        active={value === 'HISTORY'}
        count={counts.HISTORY}
        onClick={onChange}
      />
    </div>
  );
}

function PivotButton({
  segment,
  active,
  count,
  onClick,
}: {
  segment: PivotSegment;
  active: boolean;
  count?: number;
  onClick: (value: LoadPivotValue) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(segment.value)}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {segment.dot && <span className={cn('h-1.5 w-1.5 rounded-full', segment.dot)} aria-hidden />}
      {segment.label}
      {count !== undefined && (
        <span className={cn(active ? 'text-foreground' : 'text-muted-foreground/60')}>{count}</span>
      )}
    </button>
  );
}

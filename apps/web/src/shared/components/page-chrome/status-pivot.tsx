'use client';

import { cn } from '@/shared/lib/utils';

export interface StatusPivotSegment<T extends string = string> {
  value: T;
  label: string;
  /** Tailwind dot color for a glance signal (e.g. 'bg-caution'). Optional. */
  dot?: string;
  /** Render a divider before this segment (e.g. to separate History from the active funnel). */
  dividerBefore?: boolean;
}

export interface StatusPivotProps<T extends string = string> {
  segments: StatusPivotSegment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Live counts keyed by segment value. */
  counts?: Partial<Record<T, number>>;
  /** aria-label for the group. */
  label?: string;
  className?: string;
}

/**
 * StatusPivot — the canonical Zone-3 status/scope FILTER control (text + dots + counts).
 *
 * This is the lightweight funnel style used for filtering data (e.g. Loads
 * Active/Pending/…/History, Inbox Pending/Archive). It is deliberately NOT the underline
 * `PageTabs` style — those are for page NAVIGATION. Filters use this pivot; nav uses tabs.
 * See app-frontend-patterns §15.4 (Page Chrome).
 */
export function StatusPivot<T extends string>({
  segments,
  value,
  onChange,
  counts,
  label = 'Filter',
  className,
}: StatusPivotProps<T>) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto', className)} role="tablist" aria-label={label}>
      {segments.map((seg) => {
        const active = value === seg.value;
        const count = counts?.[seg.value];
        return (
          <div key={seg.value} className="flex shrink-0 items-center gap-1">
            {seg.dividerBefore && <span className="mx-1 h-4 w-px bg-border" aria-hidden />}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(seg.value)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {seg.dot && <span className={cn('h-1.5 w-1.5 rounded-full', seg.dot)} aria-hidden />}
              {seg.label}
              {count !== undefined && (
                <span className={cn(active ? 'text-foreground' : 'text-muted-foreground/60')}>{count}</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

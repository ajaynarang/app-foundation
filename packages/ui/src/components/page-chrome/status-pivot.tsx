'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const SEGMENT_CLASS =
  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface StatusPivotSegment<T extends string = string> {
  value: T;
  label: string;
  /** Tailwind dot color for a glance signal (e.g. 'bg-caution'). Optional. */
  dot?: string;
  /** Render a divider before this segment (e.g. to separate History from the active funnel). */
  dividerBefore?: boolean;
  /**
   * A rarely used segment: it folds into one **More** menu, drawn where the first overflow segment would be, so the
   * pivot stays one line. Keep them adjacent. When one is selected, the trigger shows its label and count instead.
   */
  overflow?: boolean;
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
 * This is the lightweight funnel style used for filtering data (e.g. an
 * Active/Pending/…/History or Pending/Archive funnel). It is deliberately NOT the underline
 * `PageTabs` style — those are for page NAVIGATION. Filters use this pivot; nav uses tabs.
 */
export function StatusPivot<T extends string>({
  segments,
  value,
  onChange,
  counts,
  label = 'Filter',
  className,
}: StatusPivotProps<T>) {
  const overflow = segments.filter((seg) => seg.overflow);
  const firstOverflow = overflow[0]?.value;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} role="tablist" aria-label={label}>
      {segments.map((seg) => {
        if (seg.overflow) {
          return seg.value === firstOverflow ? (
            <OverflowSegments key="more" segments={overflow} value={value} onChange={onChange} counts={counts} />
          ) : null;
        }
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
                SEGMENT_CLASS,
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

/** The overflow segments as one menu: "More", or the selected one's label and count while it is the view. */
function OverflowSegments<T extends string>({
  segments,
  value,
  onChange,
  counts,
}: {
  segments: StatusPivotSegment<T>[];
  value: T;
  onChange: (value: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  const selected = segments.find((seg) => seg.value === value);
  const selectedCount = selected ? counts?.[selected.value] : undefined;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {segments[0]?.dividerBefore && <span className="mx-1 h-4 w-px bg-border" aria-hidden />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* A tab like its siblings (a tablist owns only tabs), selected while one of its states is the view. */}
          <button
            type="button"
            role="tab"
            aria-selected={!!selected}
            aria-haspopup="menu"
            aria-label={selected ? `${selected.label} — more states` : 'More states'}
            className={cn(
              SEGMENT_CLASS,
              selected ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {selected?.dot && <span className={cn('h-1.5 w-1.5 rounded-full', selected.dot)} aria-hidden />}
            {selected ? selected.label : 'More'}
            {selectedCount !== undefined && <span className="text-foreground">{selectedCount}</span>}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuRadioGroup value={selected?.value ?? ''} onValueChange={(next) => onChange(next as T)}>
            {segments.map((seg) => {
              const count = counts?.[seg.value];
              return (
                <DropdownMenuRadioItem key={seg.value} value={seg.value}>
                  {seg.label}
                  {count !== undefined && <span className="ml-auto pl-3 text-muted-foreground">{count}</span>}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

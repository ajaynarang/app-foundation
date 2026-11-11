'use client';

import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { FilterButton } from './filter-button';
import { FilterChips } from './filter-chips';
import { FilterSelect } from './filter-select';
import { filterRowMode, type ListFilterDeclaration } from './list-filters';

export interface ListFilterRowProps {
  /** LEFT: the `<StatusPivot>` (with counts; "All" last, after a divider). Omit when the list has no status. */
  pivot?: ReactNode;
  /** RIGHT, first: the `<ListSearch>`. Omit when the list has no search. */
  search?: ReactNode;
  /**
   * RIGHT, after the search: the list's dropdown filters, declared once. Exactly one renders inline
   * as a `FilterSelect`; two or more render as ONE `FilterButton` ("Filter · n") with the applied
   * filters as removable `FilterChips` under the row. A `SegmentedControl` is not a dropdown — pass
   * it as a child.
   */
  filters?: readonly ListFilterDeclaration[];
  /**
   * RIGHT, after the filters, in this fixed order: a `<SegmentedControl>` → `<DateRangeFilter>` →
   * `<SortButton>`. Pass only the controls the list has; never reorder them.
   */
  children?: ReactNode;
  /** Resets search, filters, date and sort to the screen's defaults. */
  onClear?: () => void;
  /** Show "Clear" — true only when something non-default is applied. */
  canClear?: boolean;
  /**
   * `stacked` puts the controls under the pivot at every width — for a list inside a sheet, whose width the
   * viewport breakpoints don't know. Pages keep the default (one row from `xl`). `wrap` keeps the pivot and the
   * controls on one line whenever the list's own width holds them, and moves the controls under the pivot only when
   * it does not — for a list beside a rail, whose width the breakpoints don't know either.
   */
  layout?: 'page' | 'stacked' | 'wrap';
  className?: string;
}

/**
 * ListFilterRow — the ONE filter row of a product list: status pivot left, controls right,
 * "Clear" last. One row on desktop; the right cluster wraps under the pivot on narrow screens.
 * The pivot, search, date, sort and Clear are always visible in the row; dropdown filters are
 * inline (one) or behind the Filter button with chips (two or more).
 */
export function ListFilterRow({
  pivot,
  search,
  filters,
  children,
  onClear,
  canClear = false,
  layout = 'page',
  className,
}: ListFilterRowProps) {
  const mode = filterRowMode(filters);
  const [inlineFilter] = filters ?? [];
  // Where the chips send focus once the last one is removed.
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          layout === 'wrap' ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : 'flex flex-col gap-2',
          layout === 'page' && 'xl:flex-row xl:items-center xl:justify-between',
        )}
      >
        {pivot && <div className="min-w-0">{pivot}</div>}
        <div
          className={cn(
            'flex flex-wrap items-center gap-2',
            !pivot && layout === 'page' && 'xl:ml-auto',
            // On a phone the controls take the full width under the pivot (the search fills it), as `stacked` does.
            layout === 'wrap' && 'w-full sm:ml-auto sm:w-auto',
          )}
        >
          {search}
          {mode === 'inline' && inlineFilter && (
            <FilterSelect
              label={inlineFilter.label}
              allLabel={inlineFilter.allLabel}
              options={inlineFilter.options}
              value={inlineFilter.value}
              onChange={inlineFilter.onChange}
            />
          )}
          {mode === 'button' && filters && <FilterButton filters={filters} triggerRef={filterTriggerRef} />}
          {children}
          {canClear && onClear && (
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={onClear}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
      </div>
      {mode === 'button' && filters && <FilterChips filters={filters} focusAfterLastRemove={filterTriggerRef} />}
    </div>
  );
}

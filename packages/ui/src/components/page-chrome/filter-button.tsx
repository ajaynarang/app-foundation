'use client';

import { useId, type Ref } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';
import { FilterSelect } from './filter-select';
import { appliedFilters, type ListFilterDeclaration } from './list-filters';

export interface FilterButtonProps {
  /** The screen's dropdown filters — two or more (one stays inline, see `ListFilterRow`). */
  filters: readonly ListFilterDeclaration[];
  /** The trigger button — `FilterChips` sends focus here when the last chip is removed. */
  triggerRef?: Ref<HTMLButtonElement>;
  className?: string;
}

/**
 * FilterButton — ONE "Filter · n" trigger for a list with two or more dropdown filters. The popover
 * lists each filter with its label; the count is the applied filters, read from the same
 * declarations the chips use. Radix gives focus management and closes on Escape.
 */
export function FilterButton({ filters, triggerRef, className }: FilterButtonProps) {
  const count = appliedFilters(filters).length;
  const idPrefix = useId();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          size="sm"
          className={cn('h-9 gap-1.5 text-xs', count > 0 && 'border-primary/40 text-foreground', className)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular-nums">{count > 0 ? `Filter · ${count}` : 'Filter'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3 p-3" aria-label="Filters">
        {filters.map((filter) => {
          const controlId = `${idPrefix}-${filter.key}`;
          return (
            <div key={filter.key} className="space-y-1.5">
              <Label htmlFor={controlId} className="text-xs text-muted-foreground">
                {filter.label}
              </Label>
              <FilterSelect
                id={controlId}
                label={filter.label}
                allLabel={filter.allLabel}
                options={filter.options}
                value={filter.value}
                onChange={filter.onChange}
                className="w-full"
              />
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

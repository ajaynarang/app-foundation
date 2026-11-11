'use client';

import { useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { appliedFilters, describeFilter, type ListFilterDeclaration } from './list-filters';

export interface FilterChipsProps {
  /** The same declarations the Filter button reads — the chips are the applied ones. */
  filters: readonly ListFilterDeclaration[];
  /**
   * Where focus goes when the LAST chip is removed (the Filter trigger). A removed chip unmounts the
   * button that had focus; without a landing spot a keyboard user drops to `<body>`.
   */
  focusAfterLastRemove?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * FilterChips — the applied filters of a list, one removable chip each ("Project: Payments ×"),
 * shown under the filter row so nothing chosen behind the Filter button is hidden. Removing a chip
 * clears only that filter and moves focus to the next chip (or the previous one, or the Filter
 * trigger when none is left), so the keyboard never loses its place. Renders nothing when no filter
 * is applied.
 */
export function FilterChips({ filters, focusAfterLastRemove, className }: FilterChipsProps) {
  const applied = appliedFilters(filters);
  // The remove buttons by filter key — a non-reactive lookup for the focus hand-off.
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  if (applied.length === 0) return null;

  const handleRemove = (index: number) => {
    const neighbour = applied[index + 1] ?? applied[index - 1];
    const target = neighbour ? removeButtons.current.get(neighbour.key) : focusAfterLastRemove?.current;
    // Focus BEFORE the param update lands: the neighbour's button stays mounted (stable keys), the
    // removed chip's does not.
    target?.focus();
    applied[index].onChange(undefined);
  };

  return (
    <ul className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="Applied filters">
      {applied.map((filter, index) => {
        const { label, valueLabel } = describeFilter(filter);
        return (
          <li
            key={filter.key}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-0.5 text-xs"
          >
            <span className="text-muted-foreground">{label}: </span>
            <span className="font-medium text-foreground">{valueLabel}</span>
            <Button
              ref={(node) => {
                if (node) removeButtons.current.set(filter.key, node);
                else removeButtons.current.delete(filter.key);
              }}
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${label} filter`}
              onClick={() => handleRemove(index)}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

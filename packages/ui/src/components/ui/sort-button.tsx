'use client';

import { ArrowUpDown } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface SortOption {
  /** Unique value sent to the API */
  value: string;
  /** Display label */
  label: string;
  /** Default sort direction when first selected. Defaults to 'asc'. */
  defaultOrder?: 'asc' | 'desc';
}

interface SortButtonProps {
  options: SortOption[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
}

export function SortButton({ options, sortBy, sortOrder, onSortChange }: SortButtonProps) {
  const currentLabel = options.find((o) => o.value === sortBy)?.label ?? sortBy;

  const handleSelect = (value: string) => {
    if (value === sortBy) {
      onSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      const option = options.find((o) => o.value === value);
      onSortChange(value, option?.defaultOrder ?? 'asc');
    }
  };

  const direction = sortOrder === 'asc' ? 'ascending' : 'descending';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          aria-label={`Sort: ${currentLabel}, ${direction}`}
          title={`Sort: ${currentLabel}, ${direction}`}
        >
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          {currentLabel}
          {/* Below `lg` the trigger collapses to icon + value; the direction stays in the tooltip. */}
          <span className="hidden text-2xs opacity-60 lg:inline" aria-hidden="true">
            {sortOrder === 'asc' ? '↑' : '↓'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={sortBy} onValueChange={handleSelect}>
          {options.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label} {sortBy === opt.value && (sortOrder === 'asc' ? '↑' : '↓')}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

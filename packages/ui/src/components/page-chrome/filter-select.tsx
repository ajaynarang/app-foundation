'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../../lib/utils';

/** Radix Select cannot hold an empty value, so "no filter" travels as this sentinel inside the control only. */
const ALL_VALUE = '__all__';

export interface FilterSelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface FilterSelectProps<T extends string = string> {
  /** What the dropdown filters by — the accessible name, e.g. "Source". */
  label: string;
  /** The first option, meaning "no filter" — "All sources". */
  allLabel: string;
  options: readonly FilterSelectOption<T>[];
  /** The applied value; `undefined` = no filter. */
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  /** Lets a visible `<Label htmlFor>` name the trigger (the Filter button's popover). */
  id?: string;
  className?: string;
}

/**
 * FilterSelect — a single-select list filter whose first option is always "All <things>".
 */
export function FilterSelect<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
  id,
  className,
}: FilterSelectProps<T>) {
  return (
    <Select value={value ?? ALL_VALUE} onValueChange={(next) => onChange(next === ALL_VALUE ? undefined : (next as T))}>
      <SelectTrigger id={id} aria-label={label} className={cn('h-9 w-auto min-w-[9rem] gap-2 text-xs', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

'use client';

import type { ComponentType } from 'react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional lucide icon shown before the label. */
  icon?: ComponentType<{ className?: string }>;
  /** Hide the label on small screens (icon-only). */
  hideLabelOnMobile?: boolean;
  /** Shorter label for small screens (e.g. "Decom." for "Decommissioned"). */
  shortLabel?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** aria-label for the group. */
  label?: string;
  className?: string;
}

/**
 * SegmentedControl — the canonical boxed toggle (bordered container, active = filled
 * pill). Used for compact mutually-exclusive choices that aren't page navigation or the
 * status funnel: e.g. an entity sub-tab or a lifecycle (Active/Inactive/…)
 * filter. One sizing for all instances. See app-frontend-patterns §15.4 (Page Chrome).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center rounded-lg border border-border bg-muted p-0.5', className)}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === value;
        return (
          <Button
            key={opt.value}
            variant={active ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn('h-7 gap-1.5 px-2.5 text-xs', !active && 'text-muted-foreground hover:bg-transparent')}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.shortLabel ? (
              <>
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.shortLabel}</span>
              </>
            ) : (
              <span className={cn(opt.hideLabelOnMobile && 'hidden sm:inline')}>{opt.label}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

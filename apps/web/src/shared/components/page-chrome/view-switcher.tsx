'use client';

import type { ComponentType } from 'react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

export interface SwitcherOption<T extends string = string> {
  value: T;
  label: string;
  /** lucide icon, shown always; label hidden on mobile (hidden sm:inline). */
  icon?: ComponentType<{ className?: string }>;
}

export interface ViewSwitcherProps<T extends string = string> {
  options: SwitcherOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** aria-label for the group. Default "View". */
  label?: string;
  className?: string;
}

/**
 * Segmented control used for the view (Board/Table) and group (None/Trip) switchers in
 * the page chrome's right cluster. Extracted from the hand-rolled Loads toggle so every
 * page renders the same affordance. See app-frontend-patterns §16 (Page Chrome).
 */
function Switcher<T extends string>({ options, value, onChange, label = 'View', className }: ViewSwitcherProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('flex items-center rounded-lg bg-muted p-0.5', className)}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === value;
        return (
          <Button
            key={opt.value}
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-7 gap-1.5 px-2 text-xs',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export function ViewSwitcher<T extends string>(props: ViewSwitcherProps<T>) {
  return <Switcher {...props} label={props.label ?? 'View'} />;
}

export type GroupSwitcherProps<T extends string = string> = ViewSwitcherProps<T>;

export function GroupSwitcher<T extends string>(props: GroupSwitcherProps<T>) {
  return <Switcher {...props} label={props.label ?? 'Group'} />;
}

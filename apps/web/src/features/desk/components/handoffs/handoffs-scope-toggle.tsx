'use client';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

import type { ApprovalScope } from '../../types';

interface HandoffsScopeToggleProps {
  scope: ApprovalScope;
  onScopeChange: (next: ApprovalScope) => void;
  mineCount: number;
  allCount: number;
}

const SCOPES: Array<{ value: ApprovalScope; label: string }> = [
  { value: 'mine', label: 'Mine' },
  { value: 'all', label: 'All' },
];

/**
 * Segmented control for the Handoffs scope filter. Shares the shape
 * language with `HandoffFilters` (Shadcn Button, rounded count pill)
 * so both row-1 controls read as one toolbar rather than two.
 */
export function HandoffsScopeToggle({ scope, onScopeChange, mineCount, allCount }: HandoffsScopeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Handoff scope"
      className="inline-flex items-center rounded-md border border-border bg-card p-0.5"
    >
      {SCOPES.map((opt) => {
        const active = opt.value === scope;
        const count = opt.value === 'mine' ? mineCount : allCount;
        return (
          <Button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            variant={active ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onScopeChange(opt.value)}
            className="h-7 gap-1.5 px-2.5 text-xs font-medium"
          >
            <span>{opt.label}</span>
            <span
              className={cn(
                'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums',
                active ? 'bg-background/25 text-background' : 'bg-muted text-muted-foreground',
              )}
            >
              {count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

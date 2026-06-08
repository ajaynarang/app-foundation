'use client';

import { useState } from 'react';
import { cn } from '@sally/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Check, Clock, Info } from 'lucide-react';

/** What the risk score weighs today — drives the checked list in the popover. */
const ACTIVE_FACTORS = [
  { term: 'Hours of Service', desc: 'How close the driver is to running out of drive time' },
  { term: 'ETA vs appointment', desc: 'Whether the truck will make its next stop on time' },
] as const;

/**
 * The small "?" affordance next to the "Needs you" group heading. The driver
 * grouping is risk-score-driven, but the score today only weighs HOS and
 * ETA-slack — weather, traffic, and customer reliability are planned. This
 * popover explains, in plain dispatcher language, what's actually counted so
 * the grouping never reads as a black box.
 */
export function RiskScoreInfo() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What the risk score checks"
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground',
            'transition-colors hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'motion-reduce:transition-none',
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <p className="pb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          What the risk score checks
        </p>

        <dl className="space-y-2">
          {ACTIVE_FACTORS.map((factor) => (
            <div key={factor.term} className="flex items-start gap-2">
              <Check
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-label="Currently weighed"
              />
              <div className="min-w-0">
                <dt className="text-xs font-medium text-foreground">{factor.term}</dt>
                <dd className="text-2xs text-muted-foreground">{factor.desc}</dd>
              </div>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex items-start gap-2 border-t border-border pt-2">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-2xs text-muted-foreground">Coming soon: weather, traffic, and customer reliability.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

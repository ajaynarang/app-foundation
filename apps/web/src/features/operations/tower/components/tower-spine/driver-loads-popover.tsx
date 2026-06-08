'use client';

import { useState } from 'react';
import type { ActiveLoadView, RiskBand } from '@sally/shared-types';
import { formatLoadLabel } from '@sally/shared-types';
import { cn } from '@sally/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { ChevronDown } from 'lucide-react';
import { RISK_BAND_DOT_TOKENS, RISK_BAND_LABELS } from '../../constants';
import { useTowerInteraction } from '../../context/tower-interaction.context';
import { headlineLane, stopApptLabel } from '../../utils/tower-load-format';

interface DriverLoadsPopoverProps {
  /** The driver's loads OTHER than the headline, in urgency sort order. */
  otherLoads: ActiveLoadView[];
  /** Risk band per loadId — drives the small row dot. */
  bandByLoadId: Map<string, RiskBand>;
  driverName: string;
}

/**
 * The "+N more loads" disclosure. A real button opens a Shadcn popover
 * listing the driver's other active loads — one terse line each: load
 * number, lane, next-stop time, and a risk dot. Clicking a row opens that
 * load's detail sheet via the Tower interaction context.
 */
export function DriverLoadsPopover({ otherLoads, bandByLoadId, driverName }: DriverLoadsPopoverProps) {
  const { openLoad } = useTowerInteraction();
  const [open, setOpen] = useState(false);

  if (otherLoads.length === 0) return null;
  const count = otherLoads.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Show ${count} more ${count === 1 ? 'load' : 'loads'} for ${driverName}`}
          className={cn(
            'inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground',
            'transition-colors hover:bg-muted/70 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'motion-reduce:transition-none',
          )}
        >
          <ChevronDown className="h-3 w-3" aria-hidden />
          {count} more {count === 1 ? 'load' : 'loads'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <p className="px-1.5 pb-1 pt-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {driverName} · {count} more
        </p>
        <ul className="space-y-0.5">
          {otherLoads.map((load) => {
            const band = bandByLoadId.get(load.loadId) ?? 'on-track';
            return (
              <li key={load.loadId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openLoad(load.loadId);
                  }}
                  aria-label={`Open load ${load.loadNumber}, ${RISK_BAND_LABELS[band].toLowerCase()}`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left',
                    'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'motion-reduce:transition-none',
                  )}
                >
                  <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', RISK_BAND_DOT_TOKENS[band])} />
                  <span className="shrink-0 whitespace-nowrap text-xs font-medium text-foreground">
                    {formatLoadLabel(load.loadNumber, load.referenceNumber)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{headlineLane(load)}</span>
                  <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                    {stopApptLabel(load.nextStop)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

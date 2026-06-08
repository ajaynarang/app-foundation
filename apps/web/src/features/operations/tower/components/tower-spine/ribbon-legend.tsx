'use client';

import { useState } from 'react';
import type { RiskBand } from '@sally/shared-types';
import { cn } from '@sally/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { HelpCircle } from 'lucide-react';
import { RISK_BAND_DOT_TOKENS, RISK_BAND_LABELS } from '../../constants';

/**
 * The deadhead hatch — kept in sync with `LaneRibbon`'s segment fill so the
 * legend swatch reads identically to a real ribbon segment. Built from the
 * `--muted-foreground` CSS var (theme() can't resolve the var-backed token).
 */
const DEADHEAD_HATCH =
  'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.4) 0, hsl(var(--muted-foreground) / 0.4) 3px, transparent 3px, transparent 6px)';

const RISK_LEGEND_ORDER: RiskBand[] = ['on-track', 'at-risk', 'critical'];

/**
 * One shared legend for the driver-card ribbon. The ribbon is a dense 24-hour
 * (00→24) timeline — its marks (drive / deadhead bars, pickup / delivery
 * glyphs, the NOW line) aren't self-explanatory, so a single "?" affordance in
 * the spine header opens this key rather than bloating every card.
 */
export function RibbonLegend() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What the driver-card timeline shows"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground',
            'transition-colors hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'motion-reduce:transition-none',
          )}
        >
          <HelpCircle className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="pb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Timeline key — today, 00 to 24
        </p>

        <dl className="space-y-2">
          <LegendRow swatch={<SolidBar />} term="In transit" desc="Loaded and rolling" />
          <LegendRow swatch={<HatchBar />} term="Deadhead" desc="Empty miles to next pickup" />
          <LegendRow swatch={<StopTriangle kind="pickup" />} term="Pickup ▲" desc="Pickup appointment" />
          <LegendRow swatch={<StopTriangle kind="delivery" />} term="Delivery ▼" desc="Delivery appointment" />
          <LegendRow swatch={<NowLine />} term="NOW" desc="Current time on the day scale" />
        </dl>

        <div className="mt-3 border-t border-border pt-2">
          <p className="pb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Color = on-time risk
          </p>
          <dl className="space-y-1.5">
            {RISK_LEGEND_ORDER.map((band) => (
              <div key={band} className="flex items-center gap-2">
                <span aria-hidden className={cn('h-2.5 w-4 shrink-0 rounded-sm', RISK_BAND_DOT_TOKENS[band])} />
                <dt className="text-xs text-foreground">{RISK_BAND_LABELS[band]}</dt>
              </div>
            ))}
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One key row: a swatch, a bold term, and a plain-language description. */
function LegendRow({ swatch, term, desc }: { swatch: React.ReactNode; term: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-3 w-8 shrink-0 items-center justify-center">{swatch}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-foreground">{term}</dt>
        <dd className="text-2xs text-muted-foreground">{desc}</dd>
      </div>
    </div>
  );
}

function SolidBar() {
  return <span aria-hidden className="h-2.5 w-8 rounded-sm bg-muted-foreground/50" />;
}

function HatchBar() {
  return <span aria-hidden className="h-2.5 w-8 rounded-sm" style={{ backgroundImage: DEADHEAD_HATCH }} />;
}

function NowLine() {
  return (
    <span aria-hidden className="flex h-3 w-8 items-center justify-center">
      <span className="h-3 w-px bg-foreground" />
    </span>
  );
}

/** Pickup ▲ / delivery ▼ glyph — the same shape the ribbon draws. */
function StopTriangle({ kind }: { kind: 'pickup' | 'delivery' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'h-0 w-0 border-x-[4px] border-x-transparent',
        kind === 'pickup' ? 'border-b-[6px] border-b-foreground' : 'border-t-[6px] border-t-foreground',
      )}
    />
  );
}

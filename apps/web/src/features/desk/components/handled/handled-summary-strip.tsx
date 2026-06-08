'use client';

import { HANDLED_WINDOW_LABELS } from '../../lib/handled-date-range';
import type { HandledWindow } from '../../types';

interface HandledSummaryStripProps {
  total: number;
  byOutcome: Record<string, number>;
  autonomousPct: number;
  window: HandledWindow;
}

/**
 * Thin roll-up of total/byOutcome/autonomousPct at the top of the
 * Handled list. Renders nothing when the list is empty — the empty-state
 * component carries the contextual copy in that case.
 */
export function HandledSummaryStrip({ total, byOutcome, autonomousPct, window }: HandledSummaryStripProps) {
  if (total === 0) return null;

  const extras = Object.entries(byOutcome)
    .filter(([outcome]) => outcome !== 'resolved')
    .map(([outcome, n]) => ` · ${n} ${outcome.replace(/_/g, ' ')}`);

  return (
    <div className="rounded-md border border-border bg-card/60 px-4 py-2 text-sm text-muted-foreground">
      {HANDLED_WINDOW_LABELS[window] ?? window}: <span className="text-foreground">{total} resolved</span>
      {extras}
      {` · ${Math.round(autonomousPct * 100)}% autonomous`}
    </div>
  );
}

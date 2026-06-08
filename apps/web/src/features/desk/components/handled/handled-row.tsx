'use client';

import { Check, Clock, X } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { formatDuration, formatRelativeTime } from '@/shared/lib/utils/formatters';

import { derivePill, PILL_TONE } from '../../lib/handled-pill';
import { useDeskStore } from '../../store/desk-store';
import type { HandledListItem } from '../../types';

/**
 * Slim row for the Handled tab — outcome icon + title + 6-state pill +
 * agent/responsibility meta + duration. Entire card is a button so the
 * HandledMode sheet opens on click (T27c). The pill precedence + tone
 * live in `lib/handled-pill.ts` (shared with the sheet header for SSOT).
 */
export function HandledRow({ row }: { row: HandledListItem }) {
  const openEpisode = useDeskStore((s) => s.openEpisode);
  const pill = derivePill({
    humanDecision: row.humanDecision,
    outcome: row.outcome,
    activeSuppression: row.activeSuppression,
  });

  return (
    <button
      type="button"
      onClick={() => openEpisode(row.id)}
      className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <OutcomeIcon outcome={row.outcome} humanDecision={row.humanDecision} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-foreground">{row.decisionTitle}</p>
            <div className="flex items-center gap-2">
              <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', PILL_TONE[pill])}>{pill}</span>
              {row.activeSuppression?.suppressUntil && (
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                  until {new Date(row.activeSuppression.suppressUntil).toLocaleDateString()}
                </span>
              )}
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatRelativeTime(row.closedAt)}
              </span>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {row.agentName} · {row.responsibilityTitle} · took {formatDuration(row.durationMs / 3_600_000)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function OutcomeIcon({ outcome, humanDecision }: { outcome: string; humanDecision: string | null }) {
  if (outcome === 'approval_expired') {
    return <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />;
  }
  if (humanDecision === 'REJECTED' || outcome === 'rejected_by_operator') {
    return <X className="h-4 w-4 text-destructive" aria-hidden />;
  }
  return <Check className="h-4 w-4 text-emerald-500" aria-hidden />;
}

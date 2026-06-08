'use client';

import { cn } from '@sally/ui';
import { Badge } from '@sally/ui/components/ui/badge';
import { AlertTriangle, MessageSquare } from 'lucide-react';
import type { ActiveLoadView, RiskBand } from '@sally/shared-types';
import { RISK_BAND_EDGE_TOKENS } from '../../../constants';
import { useTowerInteraction } from '../../../context/tower-interaction.context';
import { loadLane, loadProgressPercent, slackTag } from './active-load-row.utils';

interface ActiveLoadRowProps {
  load: ActiveLoadView;
  riskBand: RiskBand;
  unreadCount: number;
  hasActiveAlert: boolean;
}

/**
 * One at-a-glance row per active load, sized for the narrow (~320px) Tower
 * spine column. A compact two-line layout:
 *  - Line 1 — load number (always fully visible) + reference/PO (truncates),
 *             plus the unread / alert badge.
 *  - Line 2 — driver · truck · lane (lane truncates), then the ETA clock and
 *             the slack/status tag (both protected from clipping).
 * A thin progress bar sits under line 2. Full detail lives behind the click.
 */
export function ActiveLoadRow({ load, riskBand, unreadCount, hasActiveAlert }: ActiveLoadRowProps) {
  const { openLoad } = useTowerInteraction();
  const tag = slackTag(load);
  const progress = loadProgressPercent(load);
  const meta = [load.driver.name, load.vehicleIdentifier, loadLane(load)].filter(Boolean).join(' · ');
  // A planned load sits on a firm trip; a "P" chip flags it (manual/rolling shows nothing).
  const isPlanned = load.assignmentState === 'assigned';

  return (
    <button
      type="button"
      onClick={() => openLoad(load.loadId)}
      aria-label={`Open load ${load.loadNumber}`}
      className={cn(
        'flex w-full flex-col gap-1 rounded-md border border-border border-l-2 bg-card px-3 py-2 text-left',
        'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        RISK_BAND_EDGE_TOKENS[riskBand],
      )}
    >
      {/* Line 1 — load #, reference (truncates), badge */}
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm font-medium text-foreground">
          <span className="shrink-0 whitespace-nowrap">#{load.loadNumber}</span>
          {isPlanned && (
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center self-center rounded border border-border text-2xs font-semibold text-muted-foreground"
              title="Planned — on a firm trip"
              aria-label="Planned load"
            >
              P
            </span>
          )}
          {load.referenceNumber?.trim() && (
            <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
              {load.referenceNumber.trim()}
            </span>
          )}
        </span>

        {(hasActiveAlert || unreadCount > 0) && (
          <span className="flex shrink-0 items-center gap-1.5">
            {hasActiveAlert && <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-label="Active alert" />}
            {unreadCount > 0 && (
              <span
                className="flex items-center gap-0.5 text-2xs font-medium text-blue-500"
                aria-label={`${unreadCount} unread messages`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {unreadCount}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Line 2 — driver · truck · lane (truncates), ETA, slack/status tag */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{meta}</span>
        <span className="shrink-0 text-xs tabular-nums text-foreground">{tag.eta}</span>
        <Badge variant="outline" className={cn('shrink-0 justify-center px-1.5 text-2xs', tag.className)}>
          {tag.label}
        </Badge>
      </div>

      {/* Thin trip-progress bar */}
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${progress}%` }} />
      </span>
    </button>
  );
}

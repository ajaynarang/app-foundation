'use client';

import { Button } from '@sally/ui/components/ui/button';
import type { TowerLayoutState } from '../../hooks/use-tower-layout';
import { HandoffCountdown } from './handoff-countdown';
import { PanelToggleGroup } from './panel-toggle-group';

interface TowerTopbarProps {
  /** Whether the incoming shift-handoff notes have been acknowledged. */
  handoffAcknowledged: boolean;
  /** When the handoff was acknowledged — ISO timestamp, if it has been. */
  handoffAcknowledgedAt: string | null;
  /** ≥1100px column layout model — drives the IDE-style panel toggles. */
  layout: TowerLayoutState;
  /** Whether the 3-column panel toggles apply (only at ≥1100px). */
  showPanelToggles: boolean;
  /** Opens the hotkeys help sheet — owned by the page so the `?` key shares it. */
  onOpenHotkeys: () => void;
}

/**
 * Tower v3 topbar (56px). Trimmed per UX direction:
 *  - section label "Tower"
 *  - spacer
 *  - clock + real handoff status (md+ only)
 *  - IDE-style panel toggles (Spine · Map · Wire, ≥1100px only)
 *  - `?` chip
 *
 * No KPI strip, no vanity counts, no operational sub-strip, no message strip.
 */
export function TowerTopbar({
  handoffAcknowledged,
  handoffAcknowledgedAt,
  layout,
  showPanelToggles,
  onOpenHotkeys,
}: TowerTopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-background px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-foreground">Tower</span>
        <span className="hidden sm:inline text-xs text-muted-foreground">Your fleet, right now</span>
      </div>

      <div className="flex-1" />

      <HandoffCountdown acknowledged={handoffAcknowledged} acknowledgedAt={handoffAcknowledgedAt} />

      {showPanelToggles && <PanelToggleGroup layout={layout} />}

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenHotkeys}
        aria-label="Keyboard shortcuts"
        className="h-7 w-7 rounded-full border border-border text-muted-foreground hover:text-foreground"
      >
        <span className="text-xs font-semibold" aria-hidden>
          ?
        </span>
      </Button>
    </header>
  );
}

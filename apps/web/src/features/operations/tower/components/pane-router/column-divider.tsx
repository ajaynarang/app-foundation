'use client';

import { PanelLeftClose, PanelRightClose } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import type { TowerColumn } from '../../hooks/use-tower-layout';

interface ColumnDividerProps {
  /** The side column this divider resizes. */
  column: TowerColumn;
  /** Human label for the column ("Drivers", "Wire") — used in aria-labels. */
  label: string;
  width: number;
  min: number;
  max: number;
  onResizeStart: (event: React.PointerEvent) => void;
  onNudge: (delta: number) => void;
  /** Collapse the column to its rail. The rail itself re-expands it; the
   *  topbar toggle handles full hide/show — collapse is a separate affordance. */
  onCollapse: () => void;
}

/** Keyboard nudge step in px. */
const NUDGE_STEP = 24;

/**
 * The seam between a side column and the map. It does double duty:
 *  - a draggable / arrow-key-operable resize handle (ARIA `separator`), and
 *  - an always-visible collapse button that folds the column to a thin rail.
 *
 * Collapse vs. hide are distinct: this seam button *collapses* the column to a
 * peek rail (still visible, click the rail to re-expand); the IDE-style topbar
 * toggle fully *hides* a column (out of the grid entirely). Hosting collapse
 * on the seam keeps the Spine and Wire components untouched.
 */
export function ColumnDivider({
  column,
  label,
  width,
  min,
  max,
  onResizeStart,
  onNudge,
  onCollapse,
}: ColumnDividerProps) {
  // The side column sits toward this edge of the seam.
  const columnSide = column === 'spine' ? 'left' : 'right';
  // Spine widens on ArrowRight (it's left of the seam); Wire widens on ArrowLeft.
  const widenKey = column === 'spine' ? 'ArrowRight' : 'ArrowLeft';
  const HideIcon = columnSide === 'left' ? PanelLeftClose : PanelRightClose;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    onNudge(e.key === widenKey ? NUDGE_STEP : -NUDGE_STEP);
  };

  return (
    <div className="group relative z-20 w-px shrink-0 bg-border">
      {/* Resize handle — the visible seam stays 1px; the grabbable hit area
          extends a slim ~5px to each side: enough to catch, not a fat strip. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        aria-valuenow={Math.round(width)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={handleKeyDown}
        className={cn(
          'absolute inset-y-0 -left-[5px] -right-[5px] cursor-col-resize touch-none select-none',
          'focus-visible:outline-none focus-visible:bg-primary/70',
          'transition-colors motion-reduce:transition-none',
          'hover:bg-foreground/20 active:bg-primary/70',
        )}
      />
      {/* Collapse button — always visible on the seam so the affordance is
          never hidden behind a hover. Folds the column to its rail. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onCollapse}
            aria-label={`Collapse ${label} panel`}
            className={cn(
              'absolute top-2 z-30 h-6 w-6 bg-card text-muted-foreground shadow-sm',
              'hover:bg-muted hover:text-foreground',
              columnSide === 'left' ? '-left-3' : '-right-3',
            )}
          >
            <HideIcon className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Collapse {label}</TooltipContent>
      </Tooltip>
    </div>
  );
}

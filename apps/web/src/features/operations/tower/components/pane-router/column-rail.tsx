'use client';

import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { cn } from '@sally/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import type { TowerColumn } from '../../hooks/use-tower-layout';

interface ColumnRailProps {
  /** The side column this rail stands in for. */
  column: TowerColumn;
  /** Human label ("Drivers", "Wire") — shown vertically on the rail. */
  label: string;
  /** Expand the column back to its full width. */
  onExpand: () => void;
}

/**
 * The collapsed state of a Tower side column — a thin vertical rail that
 * stands in for the Spine or Wire when the dispatcher has collapsed it.
 *
 * Unlike a hidden column (gone from the grid entirely, restored via the
 * topbar toggle), a collapsed column stays present as this rail: the whole
 * rail is the expand affordance, so the panel is one click from coming back.
 */
export function ColumnRail({ column, label, onExpand }: ColumnRailProps) {
  const ExpandIcon = column === 'spine' ? PanelRightOpen : PanelLeftOpen;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${label} panel`}
          className={cn(
            'group flex h-full w-full flex-col items-center gap-3 py-3',
            'bg-muted/30 text-muted-foreground',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
            column === 'spine' ? 'border-r border-border' : 'border-l border-border',
          )}
        >
          <ExpandIcon className="h-4 w-4 shrink-0" aria-hidden />
          {/* Vertical label — reads bottom-to-top so it sits naturally on a
              narrow rail. */}
          <span
            className="text-xs font-medium uppercase tracking-wide"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side={column === 'spine' ? 'right' : 'left'}>Expand {label}</TooltipContent>
    </Tooltip>
  );
}

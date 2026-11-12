'use client';

import type { ComponentType } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';

export interface ActionItem {
  label: string;
  /** lucide icon component, e.g. `RefreshCw`. Optional. */
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Renders with critical color and a separator above the first destructive item. */
  destructive?: boolean;
  disabled?: boolean;
  /** Optional group key — items with a different group than the previous one get a separator. */
  group?: string;
}

export interface PageActionsMenuProps {
  items: ActionItem[];
  /** Trigger button aria-label. Default "More actions". */
  label?: string;
  /** Menu alignment. Default "end". */
  align?: 'start' | 'end';
  className?: string;
}

/**
 * PageActionsMenu — the "⋯ More" overflow for a page's secondary actions (Zone 2,
 * rightmost in the control-bar cluster). Universal 3-dot signal, mouse-first. This is
 * distinct from the GLOBAL ⌘K command palette (navigate + search anything).
 *
 * Returns null when there are no items.
 */
export function PageActionsMenu({ items, label = 'More actions', align = 'end', className }: PageActionsMenuProps) {
  if (!items.length) return null;

  return (
    // Non-modal, and an item closes the menu when picked (no preventDefault): an item usually opens a FormSheet or an
    // AlertDialog, and a menu left open underneath would hold its own focus scope and need a second Escape to dismiss.
    // An icon-only trigger: aria-label for assistive tech, the same words in a tooltip for the pointer (as RowActions).
    <TooltipProvider>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-9 w-9 text-muted-foreground', className)}
                aria-label={label}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align={align} className="min-w-48">
          {items.map((item, index) => {
            const prev = items[index - 1];
            const needsSeparator =
              index > 0 &&
              ((item.destructive && !prev.destructive) || (item.group && prev.group && item.group !== prev.group));
            const Icon = item.icon;
            return (
              <div key={item.label}>
                {needsSeparator && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={item.disabled}
                  onSelect={() => item.onClick()}
                  className={cn('gap-2', item.destructive && 'text-critical-text focus:text-critical-text')}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {item.label}
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}

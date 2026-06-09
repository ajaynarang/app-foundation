'use client';

import type { ComponentType } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';

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
 * distinct from the GLOBAL ⌘K command palette (navigate + search anything) — see
 * app-frontend-patterns §16 (Page Chrome) and §24 (Command Palette).
 *
 * Returns null when there are no items.
 */
export function PageActionsMenu({ items, label = 'More actions', align = 'end', className }: PageActionsMenuProps) {
  if (!items.length) return null;

  return (
    <DropdownMenu>
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
      <DropdownMenuContent align={align} className="w-48">
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
                onSelect={(e) => {
                  e.preventDefault();
                  item.onClick();
                }}
                className={cn('gap-2', item.destructive && 'text-critical focus:text-critical')}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {item.label}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

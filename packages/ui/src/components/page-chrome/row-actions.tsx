'use client';

import { type ComponentType, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react';
import { usePageChrome } from './page-chrome-context';
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

export interface RowActionPrimary {
  label: string;
  /** Names the record when a short label repeats down a list ("Add" → "Add INV-12 to the batch"). */
  ariaLabel?: string;
  /** Either a handler or a destination — a navigating primary is a real link (middle-click, prefetch). */
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Why it is disabled — shown in a tooltip and read to assistive tech. A disabled control without one is a bug. */
  disabledReason?: string;
}

export interface RowActionItem {
  label: string;
  /** Names the record when the label alone doesn't ("Take out…" → "Take INV-12 out of the batch"). */
  ariaLabel?: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Rendered in the critical colour, after every other item, behind a separator. Must confirm before it acts. */
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Items whose group differs from the previous item's get a separator between them. */
  group?: string;
}

export interface RowActionsProps {
  /** The one visible action: small, filled. */
  primary?: RowActionPrimary;
  /** Everything else, behind ⋯. Empty or omitted → no ⋯. */
  items?: RowActionItem[];
  /** aria-label of the ⋯ trigger. Default "More actions". */
  menuLabel?: string;
  /**
   * Inside a list or table row the actions are revealed on hover / focus. `always` keeps them up — only for
   * a row whose action IS the point of the screen (an approver's queue), with a comment saying why.
   */
  reveal?: 'hover' | 'always';
  className?: string;
}

/**
 * What a `ListRow` `actions` / `ListCard` `headerActions` slot accepts: the RowActions
 * PROPS, never an element. A JSX element is `ReactElement<any, any>` to TypeScript, so a slot typed to take one would
 * accept `<Button>` too — props-only is what makes a raw button in these slots a type error.
 */
export type RowActionsSlot = RowActionsProps;

/** Turns slot props into one `<RowActions>` (null when there is nothing to render). */
export function renderRowActions(slot: RowActionsSlot | undefined | null, className?: string) {
  if (slot == null) return null;
  if (!slot.primary && !(slot.items && slot.items.length > 0)) return null;
  return <RowActions {...slot} className={cn(slot.className, className)} />;
}

const ICON_IN_BUTTON = 'h-4 w-4';
const ICON_ONLY_BUTTON = 'h-8 w-8 text-muted-foreground';
/**
 * The lone destructive action, visible: an outline in the critical TEXT token, not the filled destructive button.
 * In dark theme the filled pair (near-white on the light red fill) reads 2.65:1 — below AA; critical-text on the
 * page / card surface (and on its own 10 % hover tint) clears 4.5:1 in both themes.
 */
const LONE_DESTRUCTIVE_BUTTON =
  'border-critical/40 text-critical-text hover:bg-critical/10 hover:text-critical-text focus-visible:ring-critical';

/** Enter and Space on an action must not also "click" the row that holds it; Escape and arrows pass through. */
function stopActivationKeys(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
}
function stopClick(event: MouseEvent) {
  event.stopPropagation();
}

/** Destructive items go last, behind a separator, whatever order the caller declared. */
function orderItems(items: RowActionItem[]): RowActionItem[] {
  return [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)];
}

/**
 * RowActions — the one action grammar for a row, a card header and a table action cell:
 * `[primary · small · filled] [⋯]`. No items → no ⋯; destructive items last behind a separator; a lone destructive
 * item with no primary is a visible destructive button; disabled controls carry their reason; icon-only buttons
 * have an aria-label and a tooltip; clicks stop at this element so the row surface never fires.
 */
export function RowActions({
  primary,
  items = [],
  menuLabel = 'More actions',
  reveal = 'hover',
  className,
}: RowActionsProps) {
  const ordered = orderItems(items);
  const loneDestructive = !primary && ordered.length === 1 && ordered[0].destructive ? ordered[0] : null;

  if (!primary && ordered.length === 0) return null;

  return (
    <TooltipProvider>
      <div
        className={cn('flex shrink-0 items-center gap-1', className)}
        onClick={stopClick}
        onKeyDown={stopActivationKeys}
        data-testid="row-actions"
        // The reveal itself is CSS in @app/ui globals.css — keyed on these attributes, so it works in any row.
        data-row-actions=""
        data-reveal={reveal}
      >
        {primary && <PrimaryAction action={primary} />}
        {loneDestructive ? (
          <DisabledReason reason={loneDestructive.disabled ? loneDestructive.disabledReason : undefined}>
            <Button
              size="sm"
              variant="outline"
              className={LONE_DESTRUCTIVE_BUTTON}
              data-variant="destructive"
              disabled={loneDestructive.disabled}
              aria-disabled={loneDestructive.disabled || undefined}
              aria-label={loneDestructive.ariaLabel}
              onClick={loneDestructive.onSelect}
            >
              {loneDestructive.label}
            </Button>
          </DisabledReason>
        ) : (
          ordered.length > 0 && <OverflowMenu items={ordered} label={menuLabel} />
        )}
      </div>
    </TooltipProvider>
  );
}

function PrimaryAction({ action }: { action: RowActionPrimary }) {
  const { Link } = usePageChrome();
  if (action.href && !action.disabled) {
    return (
      <Button asChild size="sm">
        <Link href={action.href} onClick={action.onClick} aria-label={action.ariaLabel}>
          {action.label}
        </Link>
      </Button>
    );
  }
  return (
    <DisabledReason reason={action.disabled ? action.disabledReason : undefined}>
      <Button
        size="sm"
        disabled={action.disabled}
        aria-disabled={action.disabled || undefined}
        aria-label={action.ariaLabel}
        loading={action.loading}
        onClick={action.onClick}
      >
        {action.label}
      </Button>
    </DisabledReason>
  );
}

/** A disabled button swallows pointer events, so the tooltip hangs off a wrapper; the reason is also read aloud. */
function DisabledReason({ reason, children }: { reason?: string; children: ReactElement }) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
          <span className="sr-only">{reason}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

function OverflowMenu({ items, label }: { items: RowActionItem[]; label: string }) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={ICON_ONLY_BUTTON} aria-label={label}>
              <MoreHorizontal className={ICON_IN_BUTTON} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        {items.map((item, index) => {
          const prev = items[index - 1];
          const needsSeparator =
            index > 0 &&
            ((item.destructive && !prev.destructive) || (!!item.group && !!prev.group && item.group !== prev.group));
          const Icon = item.icon;
          const reason = item.disabled ? item.disabledReason : undefined;
          const menuItem = (
            <DropdownMenuItem
              disabled={item.disabled}
              aria-label={item.ariaLabel}
              // A disabled item keeps pointer events so its reason can be hovered.
              className={cn(
                'gap-2',
                reason && 'data-[disabled]:pointer-events-auto',
                item.destructive && 'text-critical-text focus:text-critical-text',
              )}
              // The menu closes on select (no preventDefault) and is non-modal, so a dialog the item opens
              // never fights it for focus or the body's pointer events.
              onSelect={() => {
                if (!item.disabled) item.onSelect();
              }}
            >
              {Icon && <Icon className={ICON_IN_BUTTON} aria-hidden />}
              {item.label}
              {reason && <span className="sr-only">{reason}</span>}
            </DropdownMenuItem>
          );
          return (
            <div key={item.label}>
              {needsSeparator && <DropdownMenuSeparator />}
              {reason ? (
                <Tooltip>
                  <TooltipTrigger asChild>{menuItem}</TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    {reason}
                  </TooltipContent>
                </Tooltip>
              ) : (
                menuItem
              )}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

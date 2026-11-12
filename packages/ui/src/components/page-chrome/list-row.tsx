'use client';

import { useId, type ReactNode } from 'react';
import { usePageChrome } from './page-chrome-context';
import { cn } from '../../lib/utils';
import { IDENTIFIER_CLASS } from './identifier';
import { renderRowActions, type RowActionsSlot } from './row-actions';
import { Checkbox } from '../ui/checkbox';

export interface ListRowsProps {
  children: ReactNode;
  /** The list is re-fetching over its current rows (`useCursorList().isRefreshing`) — dim it, never swap it out. */
  isRefreshing?: boolean;
  'aria-label'?: string;
  className?: string;
}

/**
 * ListRows — the one container for a row list: a bordered, rounded stack of `ListRow`s with a divider between
 * rows.
 */
export function ListRows({ children, isRefreshing = false, className, ...aria }: ListRowsProps) {
  return (
    <ul
      role="list"
      aria-label={aria['aria-label']}
      aria-busy={isRefreshing || undefined}
      className={cn(
        'divide-y divide-border overflow-hidden rounded-lg border border-border transition-opacity',
        isRefreshing && 'opacity-60',
        className,
      )}
    >
      {children}
    </ul>
  );
}

/** A row that can be picked for a bulk action: the checkbox sits before the surface, never inside its link. */
export interface ListRowSelection {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The checkbox's accessible name — "Select INV-12". */
  label: string;
  /** The row can't be picked — say why in the row's own text (`secondary`), never only on the box. */
  disabled?: boolean;
}

export interface ListRowProps {
  /** The key column: the human key / number, or a timestamp on a log. Fixed width, monospace. */
  leading?: ReactNode;
  /** `key` is the primary-coloured key; `meta` is a muted stamp (the audit log's "5m ago"). */
  leadingTone?: 'key' | 'meta';
  /** The title. Truncates to one line. */
  primary: ReactNode;
  /** One muted line under the title. */
  secondary?: ReactNode;
  /** Badges and meta, right-aligned. Hide pieces on small screens with `hidden sm:inline-flex`. */
  trailing?: ReactNode;
  /**
   * The row's actions, in the one grammar: `{ primary, items }` — RowActions props, never an element, so a raw
   * `<Button>` here is a type error. One small filled primary plus ⋯. They sit beside the row surface — never inside its link, never under the title.
   */
  actions?: RowActionsSlot;
  /** The row can be picked for a bulk action — a checkbox before the key column, outside the row's link. */
  selection?: ListRowSelection;
  /** Content shown under the row (a triage read-out). The toggle names it with `aria-controls`. */
  expanded?: ReactNode;
  /**
   * The row is a link. The surface (leading → trailing) is one `<Link>`, so `leading` and `trailing` must hold
   * no links or buttons of their own — put those in `actions`. `onSelect` still fires on click.
   */
  href?: string;
  /** Without `href`, the surface becomes a button that calls this. */
  onSelect?: () => void;
  /** The title becomes the expand / collapse toggle, carrying `aria-expanded={isExpanded}`. */
  onToggle?: () => void;
  isExpanded?: boolean;
  /** The row the sidebar rail follows: left accent + tint + `aria-current`. */
  isFocused?: boolean;
  /** A row mid-mutation or otherwise out of play. */
  isDimmed?: boolean;
  /** Names the surface for assistive tech when the visible text is not the whole story. */
  'aria-label'?: string;
  'data-testid'?: string;
  className?: string;
}

/**
 * One rhythm for every row — 48 px tall, 12 px padding. Pixel values, not rem: the app's root font-size is 13px, so
 * `min-h-12 px-3` would render 39 px / 9.75 px. Wraps only below `sm`, where the trailing cluster takes its own line. */
const SURFACE =
  'flex min-h-[48px] min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-[12px] py-2 text-left sm:flex-nowrap sm:gap-3';
/** The hover tint lives on the row itself (so actions share it); the focus ring sits on what has focus. */
const SURFACE_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

/**
 * ListRow — one line per record, one rhythm everywhere (`min-h-[48px] px-[12px] py-2 gap-3`): key column · title (+ one
 * muted line) · trailing badges · primary · ⋯, with optional content under it. Used by every queue and feed.
 */
export function ListRow({
  leading,
  leadingTone = 'key',
  primary,
  secondary,
  trailing,
  actions,
  selection,
  expanded,
  href,
  onSelect,
  onToggle,
  isExpanded = false,
  isFocused = false,
  isDimmed = false,
  className,
  ...rest
}: ListRowProps) {
  const expandedId = useId();
  const { Link } = usePageChrome();
  const ariaLabel = rest['aria-label'];
  const actionsNode = renderRowActions(actions);
  const isInteractive = Boolean(href || onSelect || onToggle);

  const leadingNode = leading != null && (
    <span
      className={cn(
        'w-20 shrink-0 truncate',
        leadingTone === 'key' ? IDENTIFIER_CLASS : 'font-mono text-xs font-medium text-muted-foreground',
      )}
    >
      {leading}
    </span>
  );
  // Spans, not <p>: the block sits inside a link or a button, which allow phrasing content only.
  const titleBlock = (
    <>
      <span className="block truncate text-sm text-foreground">{primary}</span>
      {secondary != null && <span className="block truncate text-xs text-muted-foreground">{secondary}</span>}
    </>
  );
  // Below `sm` the trailing cluster drops under the title (full width, right-aligned) so the title keeps its line.
  const trailingNode = trailing != null && (
    <span className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">{trailing}</span>
  );
  const current = isFocused ? ('true' as const) : undefined;

  let surface: ReactNode;
  if (href) {
    surface = (
      <Link
        href={href}
        onClick={onSelect}
        aria-current={current}
        aria-label={ariaLabel}
        className={cn(SURFACE, SURFACE_FOCUS)}
      >
        {leadingNode}
        <span className="min-w-0 flex-1">{titleBlock}</span>
        {trailingNode}
      </Link>
    );
  } else if (onToggle) {
    surface = (
      <div className={SURFACE} aria-current={current}>
        {leadingNode}
        {/* A raw button, as in StatusPivot: the title IS the toggle, and a Button's own box would break the row rhythm. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={expanded != null ? expandedId : undefined}
          aria-label={ariaLabel}
          className={cn('min-w-0 flex-1 text-left', SURFACE_FOCUS)}
        >
          {titleBlock}
        </button>
        {trailingNode}
      </div>
    );
  } else if (onSelect) {
    surface = (
      <button
        type="button"
        onClick={onSelect}
        aria-current={current}
        aria-label={ariaLabel}
        className={cn(SURFACE, SURFACE_FOCUS)}
      >
        {leadingNode}
        <span className="min-w-0 flex-1">{titleBlock}</span>
        {trailingNode}
      </button>
    );
  } else {
    surface = (
      <div className={SURFACE} aria-current={current}>
        {leadingNode}
        <div className="min-w-0 flex-1">{titleBlock}</div>
        {trailingNode}
      </div>
    );
  }

  return (
    <li
      data-testid={rest['data-testid']}
      data-focused={isFocused || undefined}
      className={cn(
        'relative transition-colors',
        isInteractive && 'hover:bg-muted/50',
        isFocused && 'bg-muted/40 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand',
        selection?.checked && 'bg-muted/40',
        isDimmed && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-stretch">
        {selection && (
          <div className="flex shrink-0 items-center pl-[12px]">
            <Checkbox
              checked={selection.checked}
              onCheckedChange={(checked) => selection.onCheckedChange(checked === true)}
              aria-label={selection.label}
              disabled={selection.disabled}
              className="h-4 w-4"
            />
          </div>
        )}
        {surface}
        {actionsNode != null && <div className="flex shrink-0 items-center py-2 pr-3">{actionsNode}</div>}
      </div>
      {expanded != null && (
        <div id={expandedId} className="px-3 pb-3">
          {expanded}
        </div>
      )}
    </li>
  );
}

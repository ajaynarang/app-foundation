'use client';

import type { ComponentType, ReactNode } from 'react';
import { usePageChrome } from './page-chrome-context';
import { cn } from '../../lib/utils';
import { renderRowActions, type RowActionsSlot } from './row-actions';

export interface ListCardGridProps {
  children: ReactNode;
  /** Columns at the widest breakpoint: 1 is a single-column timeline, 2 and 3 fill from `md` / `xl`. */
  columns: 1 | 2 | 3;
  /** The list is re-fetching over its current cards (`useCursorList().isRefreshing`) — dim it, never swap it out. */
  isRefreshing?: boolean;
  'aria-label'?: string;
  className?: string;
}

const GRID_COLUMNS: Record<ListCardGridProps['columns'], string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
};

/**
 * ListCardGrid — the one container for a card list.
 */
export function ListCardGrid({ children, columns, isRefreshing = false, className, ...aria }: ListCardGridProps) {
  return (
    <ul
      role="list"
      aria-label={aria['aria-label']}
      aria-busy={isRefreshing || undefined}
      className={cn(
        // `items-stretch` (the grid default) keeps every card on a grid row the same height.
        'grid items-stretch gap-4 transition-opacity',
        GRID_COLUMNS[columns],
        isRefreshing && 'opacity-60',
        className,
      )}
    >
      {children}
    </ul>
  );
}

export interface ListCardProps {
  /** Optional lucide icon at the head of the strip. */
  icon?: ComponentType<{ className?: string }>;
  /** The record's name. Truncates. Becomes the link / button when `href` / `onSelect` is set. */
  title: ReactNode;
  /** Status badges beside the name. */
  status?: ReactNode;
  /**
   * One muted line under the name (a description, a branch, a version). On an `href` / `onSelect` card it sits
   * under the stretched hit target: no `title` tooltips and nothing interactive — say it in the text instead.
   */
  description?: ReactNode;
  /**
   * The card's actions, top-right of the strip, in the one grammar: `{ primary, items }` — RowActions props,
   * never an element (a raw `<Button>` is a type error) — one action, or ⋯ when there are more. Never a button in the body or the footer. They stay
   * clickable on a linked card.
   */
  headerActions?: RowActionsSlot;
  /** The body: at most three muted lines. Same constraint as `description` on a linked card. */
  children?: ReactNode;
  /** The metadata strip at the bottom — pieces separated by middots. Same constraint as `description` on a linked card. */
  footer?: ReactNode;
  /**
   * The whole card opens this: the title link stretches over the card (`after:inset-0`), so hover and click land
   * on it everywhere but `headerActions`. Interactive content, and anything with a tooltip, must live there.
   */
  href?: string;
  /** Without `href`, the whole card is a button calling this; with it, fires on the link click too. */
  onSelect?: () => void;
  isDimmed?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
  className?: string;
}

const STRETCHED =
  'after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring';
const TITLE = 'min-w-0 truncate text-left text-sm font-medium text-foreground';

/**
 * ListCard — one record with its own identity: a header strip (icon · name · status badges · action top-right),
 * a body of at most three muted lines and a middot-separated metadata footer. Hover is a stronger border and a
 * soft shadow, with no motion.
 */
export function ListCard({
  icon: Icon,
  title,
  status,
  description,
  headerActions,
  children,
  footer,
  href,
  onSelect,
  isDimmed = false,
  className,
  ...rest
}: ListCardProps) {
  const { Link } = usePageChrome();
  const ariaLabel = rest['aria-label'];
  const actionsNode = renderRowActions(headerActions);

  let titleNode: ReactNode;
  if (href) {
    titleNode = (
      <Link href={href} onClick={onSelect} aria-label={ariaLabel} className={cn(TITLE, STRETCHED)}>
        {title}
      </Link>
    );
  } else if (onSelect) {
    titleNode = (
      <button type="button" onClick={onSelect} aria-label={ariaLabel} className={cn(TITLE, STRETCHED)}>
        {title}
      </button>
    );
  } else {
    titleNode = (
      <h3 aria-label={ariaLabel} className={TITLE}>
        {title}
      </h3>
    );
  }

  return (
    <li
      data-testid={rest['data-testid']}
      className={cn(
        'relative flex h-full flex-col rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        'hover:border-foreground/20 hover:shadow-md',
        isDimmed && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {titleNode}
            {status}
          </div>
          {description != null && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
        </div>
        {actionsNode != null && <div className="relative -my-1 -mr-1 flex shrink-0 items-center">{actionsNode}</div>}
      </div>
      {children != null && <div className="space-y-2 px-4 pb-4 text-xs text-muted-foreground">{children}</div>}
      {footer != null && (
        <div className="mt-auto border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{footer}</div>
      )}
    </li>
  );
}

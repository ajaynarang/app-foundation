'use client';

import type { ReactNode } from 'react';
import { PageActionsMenu, type ActionItem } from './page-actions-menu';
import { cn } from '@/shared/lib/utils';

export interface PageToolbarProps {
  /** LEFT slot: content tabs (a <PageTabsList> with <PageTabsTrigger>s). Optional. */
  tabs?: ReactNode;

  // RIGHT cluster — fixed visual order (right → left): [⋯ More] · [1° CTA] · [2° CTA] · [view] · [group].
  // In source/DOM (left → right) the order is the reverse, enforced below so no page can reorder it.

  /** Group switcher (e.g. None / By Trip). Leftmost in the cluster. */
  groupSwitcher?: ReactNode;
  /** View switcher (e.g. Board / Table). */
  viewSwitcher?: ReactNode;
  /** Secondary CTAs — outline/ghost buttons. Rendered in array order, left of the primary. */
  secondaryActions?: ReactNode;
  /** The single primary CTA (default-variant Button). Rightmost solid action. */
  primaryAction?: ReactNode;
  /** Overflow menu items → renders a <PageActionsMenu> (the ⋯). Rightmost. Omit/empty → no ⋯. */
  moreActions?: ActionItem[];

  className?: string;
}

/**
 * PageToolbar — Zone 2 of the canonical page chrome. Content tabs on the left; a
 * fixed-order action cluster on the right. The fixed order (group → view → secondary →
 * primary → ⋯ in the DOM, which reads ⋯ → primary → secondary → view → group from the
 * right edge) is enforced here so the primary CTA and ⌘K-adjacent overflow land in the
 * same spot on every page. See sally-frontend-patterns §16 (Page Chrome).
 */
export function PageToolbar({
  tabs,
  groupSwitcher,
  viewSwitcher,
  secondaryActions,
  primaryAction,
  moreActions,
  className,
}: PageToolbarProps) {
  const hasCluster = Boolean(groupSwitcher || viewSwitcher || secondaryActions || primaryAction || moreActions?.length);

  return (
    <div className={cn('flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between', className)}>
      {tabs ?? <span />}
      {hasCluster && (
        <div className="flex flex-wrap items-center gap-2">
          {groupSwitcher}
          {viewSwitcher}
          {secondaryActions}
          {primaryAction}
          {moreActions && <PageActionsMenu items={moreActions} />}
        </div>
      )}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { cn } from '@appshore/web-core/shared/lib/utils';

export interface PageShellProps {
  /** Zone 1 — typically <PageHeader /> */
  header?: ReactNode;
  /** Zone 2 — typically <PageToolbar /> (omit when PageHeader handles the no-tabs single row) */
  toolbar?: ReactNode;
  /** Zone 3 — typically <FilterBar /> */
  filters?: ReactNode;
  /** Zone 4 — the page's own data region (board/table/cards/list) */
  children: ReactNode;
  /** Extra bottom padding to clear floating batch-action bars. Default true (pb-20). */
  padForFloatingBar?: boolean;
  className?: string;
}

/**
 * PageShell — thin spacing wrapper for the canonical page chrome.
 *
 * Renders the four zones in order with the standard `space-y-6` rhythm. It owns
 * NO state — header/toolbar/filters are slots, children is the page's data zone.
 * Pages may skip it and place <PageHeader> directly inside their own
 * `<div className="space-y-6">` when they need bespoke structure (KPI strips,
 * banners, DnD boards). See app-frontend-patterns §16 (Page Chrome).
 */
export function PageShell({ header, toolbar, filters, children, padForFloatingBar = true, className }: PageShellProps) {
  return (
    <div className={cn('space-y-6', padForFloatingBar && 'pb-20', className)}>
      {header}
      {toolbar}
      {filters}
      {children}
    </div>
  );
}

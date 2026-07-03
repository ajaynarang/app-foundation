'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@appshore/web-core/shared/lib/utils';

export interface PageHeaderProps {
  /** REQUIRED page title (h1). */
  title: string;
  /**
   * REQUIRED one-line subtitle — the page's promise (e.g. "What needs your attention").
   * ReactNode so pages can inline links (e.g. Billing's "View AR health →").
   */
  subtitle: ReactNode;

  /**
   * Optional settings affordance — a ghost gear icon, top-right of the identity block.
   * Provide a `settingsHref` (renders a Next <Link>) OR `onSettings` (renders a button).
   * If both are given, `settingsHref` wins. Omit both → no gear.
   */
  settingsHref?: string;
  onSettings?: () => void;
  /** Tooltip / aria-label for the gear. Default "Settings". */
  settingsLabel?: string;

  /**
   * Right-cluster content for the NO-TABS layout. When the page has no content tabs,
   * Zone 1 + Zone 2 collapse into one row: title left, `actions` right (pass a bare
   * <Button> or a small cluster). When the page HAS tabs, omit this and render a
   * sibling <PageToolbar tabs={...}> below instead (set `hasTabs` so the gear stays put).
   */
  actions?: ReactNode;

  /**
   * Hint that a separate <PageToolbar tabs={...}> sibling follows. When true, the header
   * renders identity on its own row and does NOT pull `actions` up beside the title.
   */
  hasTabs?: boolean;

  className?: string;
}

/**
 * PageHeader — Zone 1 (Identity) of the canonical page chrome.
 *
 * Always renders a title + subtitle. Optionally a settings gear (top-right of identity)
 * and, for no-tabs pages, a right-aligned action cluster on the same row.
 * See app-frontend-patterns §16 (Page Chrome).
 */
export function PageHeader({
  title,
  subtitle,
  settingsHref,
  onSettings,
  settingsLabel = 'Settings',
  actions,
  hasTabs = false,
  className,
}: PageHeaderProps) {
  const hasSettings = Boolean(settingsHref || onSettings);

  const gear = hasSettings ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {settingsHref ? (
            <Link
              href={settingsHref}
              aria-label={settingsLabel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            >
              <Settings className="h-4 w-4" />
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={settingsLabel}
              onClick={onSettings}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent>{settingsLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  const identity = (
    <div className="flex items-start justify-between gap-2">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">{subtitle}</p>
      </div>
      {/* When the page has tabs, the gear stays anchored to identity (right cluster lives in PageToolbar). */}
      {hasTabs && gear}
    </div>
  );

  // No tabs → single row: identity left, [gear + actions] right.
  if (!hasTabs) {
    return (
      <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">{subtitle}</p>
        </div>
        {(actions || gear) && (
          <div className="flex items-center gap-2">
            {gear}
            {actions}
          </div>
        )}
      </div>
    );
  }

  return <div className={className}>{identity}</div>;
}

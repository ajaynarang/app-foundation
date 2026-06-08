'use client';

import { cn } from '@sally/ui';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

interface WireItemShellProps {
  stripeClassName: string;
  timestamp: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

/**
 * Shared layout for every wire variant: left stripe + body + relative
 * timestamp. Action buttons (Phase 4) are children rendered after the body.
 */
export function WireItemShell({ stripeClassName, timestamp, ariaLabel, children }: WireItemShellProps) {
  return (
    <article
      aria-label={ariaLabel}
      className="relative flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 pl-4"
    >
      <span className={cn('absolute left-0 top-2 bottom-2 w-[3px] rounded-full', stripeClassName)} aria-hidden />
      <div className="flex-1 min-w-0 text-xs text-foreground">{children}</div>
      <time className="shrink-0 text-2xs text-muted-foreground tabular-nums" dateTime={timestamp}>
        {formatRelativeShort(timestamp)}
      </time>
    </article>
  );
}

/**
 * Compact relative-time for the wire. Falls back to full relative format
 * after >24h via the shared formatter.
 */
function formatRelativeShort(timestamp: string): string {
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return 'now';
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)}m`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.floor(diffMs / (60 * 60_000))}h`;
  return formatRelativeTime(new Date(t));
}

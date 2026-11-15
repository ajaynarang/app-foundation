'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { relativeTo, timeAgo } from '../../lib/relative-time';
import { cn } from '../../lib/utils';
import { usePageChrome } from './page-chrome-context';

export interface RelativeTimeProps {
  /** ISO-8601 UTC instant from the API. */
  iso: string | null | undefined;
  /** Words before the stamp, inside the same element: `prefix="lapsed"` → "lapsed 3h ago". */
  prefix?: string;
  className?: string;
}

/**
 * "5m ago" for a past instant, "in 7d" for a future one (an expiry, a deadline) — never "-604800s ago".
 * Exported for tests.
 */
export function relativeStamp(iso: string, now: Date = new Date()): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return '';
  return at > now.getTime() ? relativeTo(iso, now) : timeAgo(iso);
}

/**
 * RelativeTime — "5m ago" (or "in 7d" when the instant is ahead) with the full timestamp (user's timezone and clock) on hover and as the machine value.
 * Uses `timeAgo` / `relativeTo` + the adapter's `formatTimestamp` (`PageChromeProvider`); never a new date helper.
 */
export function RelativeTime({ iso, prefix, className }: RelativeTimeProps) {
  const { formatTimestamp } = usePageChrome();
  if (!iso) return null;
  const full = formatTimestamp(iso);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The wrapper is positioned so the hover lands on it even under a card's stretched title link. */}
          <time dateTime={iso} className={cn('relative whitespace-nowrap', className)}>
            {prefix ? `${prefix} ` : ''}
            {relativeStamp(iso)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{full}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

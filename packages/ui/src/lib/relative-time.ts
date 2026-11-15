/**
 * Relative time — the one implementation (`@appshore/web-core/shared/lib/date-utils` re-exports it).
 * Screens render it through `<RelativeTime>`, which adds the full timestamp on hover.
 */

/** "5m ago", "2h ago", "3d ago" for a past instant; "never" for none. */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * "in 22h" / "5m ago" — a deadline relative to `now`. Floors the future side so a
 * deadline is never overstated (36h left reads "in 1d", not "in 2d"). Empty for a
 * missing or unparseable date.
 */
export function relativeTo(dateStr: string | null | undefined, now: Date = new Date()): string {
  if (!dateStr) return '';
  const ms = new Date(dateStr).getTime() - now.getTime();
  if (Number.isNaN(ms)) return '';
  const abs = Math.abs(ms);
  const round = ms >= 0 ? Math.floor : Math.round;
  const unit =
    abs >= 86_400_000
      ? `${round(abs / 86_400_000)}d`
      : abs >= 3_600_000
        ? `${round(abs / 3_600_000)}h`
        : `${Math.max(1, round(abs / 60_000))}m`;
  return ms >= 0 ? `in ${unit}` : `${unit} ago`;
}

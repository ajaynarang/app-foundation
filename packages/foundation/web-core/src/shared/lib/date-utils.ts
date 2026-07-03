import { SEMANTIC_COLORS, getSyncFreshnessColor } from './colors';

/**
 * Format a date string as a relative time (e.g., "5m ago", "2h ago")
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Return a Tailwind color class based on sync freshness.
 * Neutral (<5m), Caution (<30m), Critical (>30m), Neutral (no data)
 */
export function syncFreshnessColor(dateStr: string | null | undefined): string {
  return SEMANTIC_COLORS[getSyncFreshnessColor(dateStr ?? null)].text;
}

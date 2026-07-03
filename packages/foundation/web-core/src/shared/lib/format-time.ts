/**
 * Shared time formatting utilities for durations.
 */

/**
 * Format decimal hours into a human-readable duration string.
 *
 * @example formatDurationHours(4.5)  → "4h 30m"
 * @example formatDurationHours(2)    → "2h"
 * @example formatDurationHours(0.25) → "15m"
 */
export function formatDurationHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

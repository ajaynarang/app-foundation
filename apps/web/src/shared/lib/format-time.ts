/**
 * Shared time formatting utilities for HOS clocks and route durations.
 */

/**
 * Format decimal hours into a compact HOS-style string.
 *
 * @example formatHOSHours(9.2)  → "9h 12m"
 * @example formatHOSHours(11)   → "11h"
 * @example formatHOSHours(0.5)  → "0h 30m"
 */
export function formatHOSHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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

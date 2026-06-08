/** Shared utilities for route plan display components */

/**
 * Single HOS hour formatter for the routing UI. Returns "8h 35m" / "45m" / "0m".
 * Never rounds HOS hour values to integers — sub-minute rounding only.
 * Compact gauge cells (e.g. "8.6/8H") may use `.toFixed(1)` directly; everything
 * else goes through this function. See .docs/plans/05-routing/
 * 2026-05-27-smart-route-truthful-clocks-v2-design.md §Consistency Contract.
 */
export function formatHours(hours: number): string {
  if (hours <= 0) return '0m';
  if (hours < 1) {
    const m = Math.round(hours * 60);
    // Edge: 0.9917h rounds to 60 — promote to 1h so we never render "60m".
    return m >= 60 ? '1h' : `${m}m`;
  }
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m >= 60) {
    // Edge: 7.9917h would render as "7h 60m" — promote minutes into hours.
    h += 1;
    m = 0;
  }
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function statusVariant(status: string): 'default' | 'muted' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'cancelled':
      return 'destructive';
    case 'completed':
    case 'superseded':
      return 'outline';
    default:
      return 'muted';
  }
}

export function statusBadgeClassName(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-accent text-white border-accent';
    case 'completed':
      return 'bg-muted text-muted-foreground border-border';
    case 'cancelled':
      return 'bg-muted text-muted-foreground border-border';
    case 'superseded':
      return 'bg-caution/10 text-caution border-caution/20';
    case 'draft':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return '';
  }
}

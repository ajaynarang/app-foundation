import type { RoutePlanResult, RouteSegment } from '@/features/routing/route-planning';

export { formatDurationHours as formatDuration } from '@/shared/lib/format-time';

// The runtime API response includes a `status` field on segments (not in the
// static schema which reflects the planning input shape). Cast to access it.
type SegmentWithStatus = RouteSegment & { status?: string };

/**
 * Find the current active segment in a route plan.
 * Returns the first in_progress segment, or the first non-completed segment.
 */
export function getCurrentSegment(plan: RoutePlanResult | null | undefined): RouteSegment | undefined {
  if (!plan?.segments?.length) return undefined;

  const sorted = [...(plan.segments as SegmentWithStatus[])].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  // First try to find an in_progress segment
  const inProgress = sorted.find((s) => s.status === 'IN_PROGRESS');
  if (inProgress) return inProgress as RouteSegment;

  // Otherwise, the first non-completed segment
  return sorted.find((s) => s.status !== 'COMPLETED') as RouteSegment | undefined;
}

/**
 * Get the segment type color for styling.
 */
export function getSegmentColor(segmentType: string): string {
  const colors: Record<string, string> = {
    drive: '#7c8aff',
    rest: '#8b5cf6',
    fuel: '#f59e0b',
    dock: '#4ade80',
    break: '#94a3b8',
  };
  return colors[segmentType] || colors.drive;
}

/**
 * Get a time-of-day greeting.
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Format an ETA from ISO string.
 */
export function formatETA(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.max(0, Math.round(diffMs / (1000 * 60 * 60)));

  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const dateStr = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  if (diffH < 24) return timeStr;
  return `${dateStr} ${timeStr}`;
}

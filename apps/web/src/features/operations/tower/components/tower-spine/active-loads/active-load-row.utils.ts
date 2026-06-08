import type { ActiveLoadView } from '@sally/shared-types';
import { formatTime } from '@/shared/lib/utils/formatters';
import { formatSlackMagnitude, loadLane } from '../../../utils/tower-load-format';

// Re-exported so row imports stay local; the canonical implementation lives
// in tower-load-format (shared with the spine driver lane).
export { loadLane };

interface SlackTag {
  /** Short ETA clock label, e.g. "3:40p" or "—". */
  eta: string;
  /** Slack-or-status label for the badge. */
  label: string;
  /** Tailwind classes tinting the badge by slack sign. */
  className: string;
}

const TAG_ON_TRACK = 'border-transparent bg-muted text-muted-foreground';
const TAG_TIGHT = 'border-transparent bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
const TAG_LATE = 'border-transparent bg-red-500/10 text-red-600 dark:text-red-400';

/**
 * Derives the single slack-or-status tag for a drawer row. Negative slack
 * reads as "late", a thin positive cushion reads as "tight", otherwise the
 * cushion is shown as "+N". Falls back to the assignment state when slack
 * is unknown — no separate status pill.
 */
export function slackTag(load: ActiveLoadView): SlackTag {
  const eta = load.etaAt ? formatTime(new Date(load.etaAt)) : '—';
  const slack = load.slackMinutes;

  if (slack === null) {
    return {
      eta,
      label: load.assignmentState === 'rolling' ? 'Rolling' : 'Planned',
      className: TAG_ON_TRACK,
    };
  }
  if (slack < 0) {
    const mag = formatSlackMagnitude(Math.abs(slack));
    return { eta, label: mag === '>1d' ? 'overdue' : `-${mag}`, className: TAG_LATE };
  }
  if (slack <= 30) {
    return { eta, label: `+${formatSlackMagnitude(slack)}`, className: TAG_TIGHT };
  }
  return { eta, label: `+${formatSlackMagnitude(slack)}`, className: TAG_ON_TRACK };
}

/**
 * Coarse trip progress for the thin row bar. Both stops arrived → 100,
 * current arrived only → ~55, nothing arrived → 10 so the bar never
 * reads empty. This is intentionally approximate — the row is at-a-glance.
 */
export function loadProgressPercent(load: ActiveLoadView): number {
  const currentArrived = !!load.currentStop?.arrivedAt;
  const nextArrived = !!load.nextStop?.arrivedAt;
  if (currentArrived && nextArrived) return 100;
  if (currentArrived) return 55;
  return 10;
}

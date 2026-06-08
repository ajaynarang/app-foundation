import type { LoadLegStatus } from '@sally/shared-types';

/** Visual variant config for each leg status */
export const LEG_STATUS_VARIANTS: Record<
  LoadLegStatus,
  {
    label: string;
    /** General-purpose className (backward compat) */
    className: string;
    /** Dot indicator on timeline */
    dotClass: string;
    /** Badge in leg card header */
    badgeClass: string;
    /** Small pill for kanban cards */
    pillClass: string;
  }
> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-muted text-muted-foreground',
    dotClass: 'border-2 border-muted-foreground bg-background',
    badgeClass: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30',
    pillClass: 'bg-muted text-muted-foreground border border-border',
  },
  ASSIGNED: {
    label: 'Assigned',
    className: 'bg-blue-500/10 text-blue-500',
    dotClass: 'bg-blue-500 border-2 border-blue-500',
    badgeClass: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
    pillClass: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  },
  IN_TRANSIT: {
    label: 'In Transit',
    className: 'bg-green-500/10 text-green-500',
    dotClass: 'bg-green-500 border-2 border-green-500 shadow-[0_0_8px_hsl(142_71%_45%/0.4)]',
    badgeClass: 'bg-green-500/10 text-green-400 border border-green-500/30',
    pillClass: 'bg-green-500/10 text-green-400 border border-green-500/30',
  },
  ON_HOLD: {
    label: 'On Hold',
    className: 'bg-yellow-500/10 text-yellow-500',
    dotClass: 'bg-yellow-500 border-2 border-yellow-500',
    badgeClass: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30',
    pillClass: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30',
  },
  DELIVERED: {
    label: 'Delivered',
    className: 'bg-muted text-muted-foreground',
    dotClass: 'bg-blue-500 border-2 border-blue-500',
    badgeClass: 'bg-foreground/10 text-muted-foreground border border-border',
    pillClass: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-red-500/10 text-red-500',
    dotClass: 'bg-red-500 border-2 border-red-500',
    badgeClass: 'bg-red-500/10 text-red-400 border border-red-500/30',
    pillClass: 'bg-red-500/10 text-red-400 border border-red-500/30',
  },
};

/** Purple relay badge class for kanban cards */
export const RELAY_BADGE_CLASS = 'bg-purple-500/10 text-purple-400 border border-purple-500/30';

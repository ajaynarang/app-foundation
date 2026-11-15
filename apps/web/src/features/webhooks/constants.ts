import type { StatusVariant } from '@app/ui';

/** One label and one tone per delivery outcome (ui-grammar-guard.test.ts holds the tones). */
export const DELIVERY_STATUS_VARIANTS: Record<'DELIVERED' | 'FAILED' | 'PENDING', StatusVariant> = {
  DELIVERED: { label: 'Delivered', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  PENDING: { label: 'Pending', tone: 'neutral' },
};

/** A subscription is switched on (sending) or off. */
export const SUBSCRIPTION_STATE_VARIANTS: Record<'ACTIVE' | 'INACTIVE', StatusVariant> = {
  ACTIVE: { label: 'Active', tone: 'info' },
  INACTIVE: { label: 'Inactive', tone: 'muted' },
};

export function subscriptionState(active: boolean): StatusVariant {
  return SUBSCRIPTION_STATE_VARIANTS[active ? 'ACTIVE' : 'INACTIVE'];
}

/** "All events (*)", or the first two names and how many more. */
export function summariseEvents(events: readonly string[]): string {
  if (events.includes('*')) return 'All events (*)';
  if (events.length === 0) return 'None';
  if (events.length <= 2) return events.join(', ');
  return `${events.slice(0, 2).join(', ')} +${events.length - 2} more`;
}

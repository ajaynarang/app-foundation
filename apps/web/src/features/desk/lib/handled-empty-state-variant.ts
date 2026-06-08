import type { HandledWindow } from '../types';

/**
 * 4 empty-state variants for the Handled tab (design spec Q8):
 *
 * - `morning` — before tenant-local noon + window=today: "Quiet morning,
 *   Sally's still working."
 * - `afternoon` — noon+ local + window=today: "Nothing closed today yet."
 * - `new_tenant` — multi-day window + tenant <7d old: onboarding tone.
 * - `general` — everything else: suggests widening the range.
 *
 * Logic lives here (not inline in the component) so we can unit-test the
 * selection in isolation once T28 backfills tests.
 */
export type EmptyStateVariant = 'morning' | 'afternoon' | 'new_tenant' | 'general';

export interface EmptyStateVariantInput {
  window: HandledWindow;
  now: Date;
  /**
   * Age of the tenant in days. When the user has an account <7d old and
   * is viewing a multi-day window, we show the onboarding copy instead
   * of the generic empty state.
   */
  tenantAgeDays: number;
  /** Whether Needs You currently has any rows — reserved for future copy tweaks. */
  liveHasRows: boolean;
}

export function chooseEmptyStateVariant(input: EmptyStateVariantInput): EmptyStateVariant {
  const { window, now, tenantAgeDays } = input;
  const isMultiDay = window === '7d' || window === '30d' || window === 'this_month' || window === 'custom';

  if (isMultiDay && tenantAgeDays < 7) return 'new_tenant';

  if (window === 'today') {
    return now.getHours() < 12 ? 'morning' : 'afternoon';
  }

  return 'general';
}

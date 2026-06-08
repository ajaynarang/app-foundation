/**
 * Shared formatting utilities for pricing and plan display.
 * Used across web, console, and backend apps.
 */

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
  TRIAL: 'Trial',
  TRIAL_EXPIRED: 'Trial (Expired)',
};

const PLAN_TIER_ORDER = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;

/**
 * Format a price in cents to a display string (e.g. "$29/mo").
 * Returns 'Custom' for null values.
 */
export function formatPriceCents(cents: number | null, suffix = '/mo'): string {
  if (cents == null) return 'Custom';
  const dollars = cents / 100;
  const formatted = dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2);
  return `$${formatted}${suffix}`;
}

/**
 * Get the user-facing display name for a plan key.
 */
export function planDisplayName(plan: string): string {
  return PLAN_DISPLAY_NAMES[plan] ?? plan;
}

/**
 * Given a list of plan keys, return the lowest tier that appears in the list.
 * Useful for "included in X+" messaging.
 */
export function getLowestIncludedPlan(plans: string[]): string | null {
  for (const plan of PLAN_TIER_ORDER) {
    if (plans.includes(plan)) return plan;
  }
  return null;
}

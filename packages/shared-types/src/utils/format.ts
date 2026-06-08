/**
 * Shared formatting utilities for pricing and plan display.
 * Used across web, console, and backend apps.
 */

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  STARTER: 'Haul',
  PROFESSIONAL: 'Fleet',
  ENTERPRISE: 'Freight Force',
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

/**
 * Marker shown when a load is rendered without a customer reference / PO number.
 * Centralised here so every surface (table, sheet, toast, Tower, etc.) renders
 * the same glyph + copy. If you see this in production it means either the load
 * genuinely has no PO on file or the API path forgot to select `referenceNumber`
 * on its `load` payload — both are worth investigating.
 */
export const NO_PO_MARKER = '⚠ no PO';

const noPoWarned = new Set<string>();

/**
 * Format a load's display label combining load number and reference/PO number.
 *
 * Examples:
 *   formatLoadLabel('LD-001', 'PO-12345')  → '#LD-001 · PO-12345'
 *   formatLoadLabel('LD-001', null)         → '#LD-001 · ⚠ no PO'
 *   formatLoadLabel('LD-001', '')           → '#LD-001 · ⚠ no PO'
 *
 * Use this everywhere a load identifier is displayed to ensure
 * the customer's PO/reference number is never hidden.
 *
 * When the reference number is missing we explicitly render `⚠ no PO` instead
 * of falling back silently — that way a load that truly has no PO and a load
 * whose `referenceNumber` was dropped by the API look the same on screen, and
 * it's obvious from any surface that there's a data gap to chase. In dev mode
 * we also emit a one-shot `console.warn` per load to make it easy to find the
 * missing API path in DevTools.
 */
export function formatLoadLabel(loadNumber: string, referenceNumber?: string | null): string {
  const ref = referenceNumber?.trim();
  if (ref) return `#${loadNumber} · ${ref}`;

  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    if (!noPoWarned.has(loadNumber)) {
      noPoWarned.add(loadNumber);
      // eslint-disable-next-line no-console
      console.warn(
        `[formatLoadLabel] load ${loadNumber} rendered without a PO/referenceNumber. ` +
          `Check whether the load truly has no PO or the API payload omitted it.`,
      );
    }
  }

  return `#${loadNumber} · ${NO_PO_MARKER}`;
}

/**
 * Shared utilities for Sally AI rich card components.
 */

import { SEMANTIC_COLORS } from '@/shared/lib/colors';

/** Helper to build `bg + text` badge style from a semantic color key. */
function badge(key: keyof typeof SEMANTIC_COLORS): string {
  return `${SEMANTIC_COLORS[key].bg} ${SEMANTIC_COLORS[key].text}`;
}

/** Format cents as USD currency string. Null-safe — returns $0.00 for null/undefined. */
export function formatCents(cents: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((cents ?? 0) / 100);
}

/** Status badge styles for invoice cards (includes FACTORED). */
export const invoiceStatusStyles: Record<string, string> = {
  DRAFT: badge('neutral'),
  SENT: badge('info'),
  VIEWED: badge('info'),
  PARTIAL: badge('caution'),
  PAID: badge('neutral'),
  OVERDUE: badge('critical'),
  VOID: badge('neutral'),
  FACTORED: badge('info'),
};

/** Status badge styles for settlement cards. */
export const settlementStatusStyles: Record<string, string> = {
  DRAFT: badge('neutral'),
  APPROVED: badge('info'),
  PAID: badge('neutral'),
  VOID: badge('neutral'),
};

/** Status badge styles for driver cards. */
export const driverStatusStyles: Record<string, string> = {
  ACTIVE: badge('neutral'),
  INACTIVE: badge('neutral'),
  PENDING_ACTIVATION: badge('caution'),
};

/** Status badge styles for vehicle cards. */
export const vehicleStatusStyles: Record<string, string> = {
  AVAILABLE: badge('neutral'),
  ASSIGNED: badge('info'),
  IN_SHOP: badge('caution'),
  OUT_OF_SERVICE: badge('critical'),
};

/** Status badge styles for load cards. */
export const loadStatusStyles: Record<string, string> = {
  DRAFT: badge('neutral'),
  PENDING: badge('neutral'),
  ASSIGNED: badge('info'),
  IN_TRANSIT: badge('info'),
  DELIVERED: badge('neutral'),
  ON_HOLD: badge('caution'),
  CANCELLED: badge('neutral'),
  TONU: badge('neutral'),
};

/** Status badge styles for load stop status. */
export const stopStatusStyles: Record<string, string> = {
  pending: badge('neutral'),
  arrived: badge('info'),
  in_progress: badge('caution'),
  completed: badge('neutral'),
};

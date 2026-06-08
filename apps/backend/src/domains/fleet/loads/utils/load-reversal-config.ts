/**
 * Central configuration for all load status reversals.
 * Single source of truth — all reversal rules, guardrails, and cascade definitions.
 */

// ── Constants ────────────────────────────────────────────
export const REVERSAL_TIME_WINDOW_DAYS = 7;
export const REVERSAL_ESCALATION_ROLE = 'ADMIN';

// ── Types ────────────────────────────────────────────────
export type CascadeAction =
  | 'reset_active_stops'
  | 'supersede_route_plan'
  | 'clear_in_transit_timestamps'
  | 'reset_delivery_stop'
  | 'clear_pod'
  | 'void_draft_invoice'
  | 'remove_draft_settlement_lines'
  | 'void_any_draft_invoices'
  | 'clear_assignment'
  | 'void_tonu_draft_invoice';

export type BillingBlocker = 'INVOICE_SENT' | 'INVOICE_PAID' | 'TONU_INVOICE_SENT' | 'TONU_INVOICE_PAID';

export interface ReversalDefinition {
  from: string;
  to: string;
  timeWindowDays: number | null;
  defaultRole: string;
  escalatedRole: string | null;
  billingBlockers: BillingBlocker[];
  cascades: CascadeAction[];
  clearFields: string[];
  notifyDriver?: boolean;
  notifyTeam?: boolean;
}

// ── Reversal Definitions ─────────────────────────────────
export const REVERSAL_DEFINITIONS: Record<string, ReversalDefinition> = {
  'IN_TRANSIT→ASSIGNED': {
    from: 'IN_TRANSIT',
    to: 'ASSIGNED',
    timeWindowDays: null,
    defaultRole: 'DISPATCHER',
    escalatedRole: null,
    billingBlockers: [],
    cascades: ['reset_active_stops', 'supersede_route_plan', 'clear_in_transit_timestamps'],
    clearFields: ['inTransitAt'],
    notifyDriver: true,
  },
  'DELIVERED→IN_TRANSIT': {
    from: 'DELIVERED',
    to: 'IN_TRANSIT',
    timeWindowDays: null,
    defaultRole: 'DISPATCHER',
    escalatedRole: null,
    billingBlockers: ['INVOICE_SENT', 'INVOICE_PAID'],
    cascades: ['reset_delivery_stop', 'clear_pod', 'void_draft_invoice', 'remove_draft_settlement_lines'],
    clearFields: ['deliveredAt', 'billingStatus'],
    notifyDriver: true,
  },
  'CANCELLED→PENDING': {
    from: 'CANCELLED',
    to: 'PENDING',
    timeWindowDays: REVERSAL_TIME_WINDOW_DAYS,
    defaultRole: 'DISPATCHER',
    escalatedRole: REVERSAL_ESCALATION_ROLE,
    billingBlockers: [],
    cascades: ['void_any_draft_invoices', 'clear_assignment'],
    clearFields: ['cancelledAt', 'assignedAt', 'inTransitAt', 'driverId', 'vehicleId'],
    notifyTeam: true,
  },
  'TONU→PENDING': {
    from: 'TONU',
    to: 'PENDING',
    timeWindowDays: REVERSAL_TIME_WINDOW_DAYS,
    defaultRole: 'DISPATCHER',
    escalatedRole: REVERSAL_ESCALATION_ROLE,
    billingBlockers: ['TONU_INVOICE_SENT', 'TONU_INVOICE_PAID'],
    cascades: ['void_tonu_draft_invoice', 'clear_assignment'],
    clearFields: ['tonuAt', 'tonuReason', 'assignedAt', 'inTransitAt', 'driverId', 'vehicleId'],
    notifyTeam: true,
  },
};

export function getReversalDefinition(from: string, to: string): ReversalDefinition | undefined {
  return REVERSAL_DEFINITIONS[`${from}→${to}`];
}

export function isReversalTransition(from: string, to: string): boolean {
  return `${from}→${to}` in REVERSAL_DEFINITIONS;
}

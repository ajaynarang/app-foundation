import type { ArFollowup } from '@app/shared-types';

import type { HydrateMemoryItem, HydratePreflightResult, SharedHydrateOutput } from '../../shared-steps/step.types';

/**
 * AR Follow-up step I/O — the shapes that flow between this responsibility's
 * Inngest steps (hydrate → perceive → decide → draft). Local to AR so the
 * shared step engine never depends on AR's entity shape. Mirrors the
 * per-responsibility `step.types.ts` convention used by every responsibility.
 */

export interface HydrateInput {
  episodeId: string;
  responsibilityKey: 'ar_followup';
}

export interface HydrateEntityInvoice {
  invoiceNumber: string;
  amount: number;
  daysFromDue: number;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  paidCents: number;
  balanceCents: number;
  totalCents: number;
  issueDate: string;
  dueDate: string;
  status: string;
  internalNotes: string | null;
}

export interface HydrateEntityCustomerStats {
  dsoDays: number | null;
  avgDaysLate: number | null;
  openInvoiceCount: number;
  openBalanceCents: number;
}

export interface HydrateCommsItem {
  sentAt: string;
  subject: string | null;
  replyTo: string | null;
  principalLabel: string;
}

export interface HydrateOutput extends SharedHydrateOutput {
  entity: {
    invoice: HydrateEntityInvoice;
    customerStats: HydrateEntityCustomerStats;
    priorReminderCount: number;
    priorReminders: HydrateCommsItem[];
  };
  memories: HydrateMemoryItem[];
  preflight: HydratePreflightResult;
}

export type PerceiveOutput = ArFollowup.ArFollowupPerceive;
export type DecideOutput = ArFollowup.ArFollowupDecide;
export type DraftOutput = ArFollowup.ArFollowupDraft;

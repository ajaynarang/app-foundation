import type { SupportPriority, SupportStatus } from '@appshore/db';

import type { HydrateMemoryItem, HydratePreflightResult, SharedHydrateOutput } from '../../shared-steps/step.types';
import type { SupportFollowupDecide, SupportFollowupDraft, SupportFollowupPerceive } from './schemas';

/**
 * Support follow-up step I/O: what flows between this job's steps (hydrate → perceive → decide → draft). It is local
 * to the job, so the shared gate, execute and close steps never learn what a ticket is.
 */

export const SUPPORT_FOLLOWUP_KEY = 'support_followup';
export const SUPPORT_TICKET_ENTITY = 'support_ticket';

export interface HydrateInput {
  episodeId: string;
}

export interface HydrateTicket {
  ticketNumber: string;
  subject: string;
  description: string;
  category: string;
  priority: SupportPriority;
  status: SupportStatus;
  openedAt: string;
  /** Whole days since the last reply either side made (or since the ticket was opened). */
  daysQuiet: number;
}

export interface HydrateThreadMessage {
  /** "user" (this workspace), "admin" (support) or "system". */
  authorRole: string;
  content: string;
  createdAt: string;
}

export interface HydrateOutput extends SharedHydrateOutput {
  entity: {
    ticket: HydrateTicket;
    /** The last replies, oldest first. Internal notes are never loaded. */
    thread: HydrateThreadMessage[];
    /** Follow-ups this job already sent on this ticket. */
    priorFollowUpCount: number;
  };
  memories: HydrateMemoryItem[];
  preflight: HydratePreflightResult;
}

export type PerceiveOutput = SupportFollowupPerceive;
export type DecideOutput = SupportFollowupDecide;
export type DraftOutput = SupportFollowupDraft;

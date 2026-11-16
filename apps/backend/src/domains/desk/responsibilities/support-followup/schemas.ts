import { z } from 'zod';
import { SupportPrioritySchema } from '@app/shared-types';

import type { ConditionsUISpec } from '../../core/types';

/**
 * Support follow-up: the shapes an operator edits (conditions) and the shapes the model returns (perceive, decide,
 * draft). They live in the Desk folder, not in shared-types, so a product scaffolded without Desk loses them with it.
 */

/** The operator's hard rules. `staleAfterDays` picks the tickets; the other two decide ask or act under ASSISTED. */
export const SupportFollowupConditionsSchema = z.object({
  staleAfterDays: z.number().int().min(1).max(60).default(3),
  maxFollowUps: z.number().int().min(1).max(5).default(1),
  autoSendPriorities: z.array(SupportPrioritySchema).default(['LOW', 'MEDIUM']),
});
export type SupportFollowupConditions = z.infer<typeof SupportFollowupConditionsSchema>;

export const SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS: SupportFollowupConditions = {
  staleAfterDays: 3,
  maxFollowUps: 1,
  autoSendPriorities: ['LOW', 'MEDIUM'],
};

export const SupportFollowupConditionsUI: ConditionsUISpec = {
  fields: [
    {
      key: 'staleAfterDays',
      label: 'Follow up after this many quiet days',
      control: 'number',
      helpText: 'A ticket with no reply from either side for this long is picked up.',
      min: 1,
      max: 60,
    },
    {
      key: 'maxFollowUps',
      label: 'Follow-ups sent without asking',
      control: 'number',
      helpText: 'After this many follow-ups on one ticket, the next one always waits for your approval.',
      min: 1,
      max: 5,
    },
    {
      key: 'autoSendPriorities',
      label: 'Priorities that may be sent without asking',
      control: 'enum-multiselect',
      helpText: 'A ticket of any other priority always waits for your approval.',
      options: SupportPrioritySchema.options.map((value) => ({
        value,
        label: value.charAt(0) + value.slice(1).toLowerCase(),
      })),
    },
  ],
};

// Confidence is a plain number: structured-output providers can reject min/max on numbers.

export const SupportFollowupPerceiveSchema = z.object({
  state: z.enum(['waiting_on_support', 'waiting_on_us', 'answered', 'unclear']),
  summary: z.string(),
  confidence: z.number(),
});
export type SupportFollowupPerceive = z.infer<typeof SupportFollowupPerceiveSchema>;

export const SupportFollowupDecideSchema = z.object({
  action: z.enum(['follow_up', 'no_action', 'escalate']),
  reasoning: z.string(),
  confidence: z.number(),
});
export type SupportFollowupDecide = z.infer<typeof SupportFollowupDecideSchema>;

export const SupportFollowupDraftSchema = z.object({
  content: z.string(),
  confidence: z.number(),
});
export type SupportFollowupDraft = z.infer<typeof SupportFollowupDraftSchema>;

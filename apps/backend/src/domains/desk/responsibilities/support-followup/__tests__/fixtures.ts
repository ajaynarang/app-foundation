import type { DecideOutput, DraftOutput, HydrateOutput, PerceiveOutput } from '../step.types';

/** One quiet ticket, as hydrate returns it. Shared by this job's specs. */
export function makeHydrate(
  overrides: Partial<HydrateOutput['entity']['ticket']> = {},
  priorFollowUpCount = 0,
): HydrateOutput {
  return {
    entity: {
      ticket: {
        ticketNumber: 'ST-1001',
        subject: 'Export to CSV fails',
        description: 'The export button returns an error since Monday.',
        category: 'TECHNICAL',
        priority: 'MEDIUM',
        status: 'OPEN',
        openedAt: '2026-11-01T09:00:00.000Z',
        daysQuiet: 6,
        ...overrides,
      },
      thread: [{ authorRole: 'user', content: 'Any news?', createdAt: '2026-11-04T09:00:00.000Z' }],
      priorFollowUpCount,
    },
    memories: [],
    preflight: { action: 'proceed' },
    relationshipRef: { supportCategory: 'TECHNICAL' },
  };
}

export const PERCEIVE: PerceiveOutput = {
  state: 'waiting_on_support',
  summary: 'The workspace reported a failing export; support has not answered.',
  confidence: 0.92,
};

export const DECIDE: DecideOutput = {
  action: 'follow_up',
  reasoning: 'Opened 6 days ago, no reply from support, no follow-up sent yet.',
  confidence: 0.93,
};

export const DRAFT: DraftOutput = {
  content: 'Could you share an update on the failing CSV export? It has been six days.',
  confidence: 0.9,
};

import { DeskEpisodeStepKind } from '@appshore/db';

import { ApprovalArtifactSchema } from '../../../core/types';
import { ApprovalEnrichmentService } from '../../../core/approval/approval-enrichment.service';
import { buildSupportFollowupApprovalPayload } from '../approval-adapter';
import { DECIDE, DRAFT, PERCEIVE, makeHydrate } from './fixtures';

const proposedAction = { ticketNumber: 'ST-1001', content: DRAFT.content };

describe('support follow-up: approval adapter', () => {
  it('builds the whole sheet from the step outputs', () => {
    const payload = buildSupportFollowupApprovalPayload({
      hydrate: makeHydrate(),
      perceive: PERCEIVE,
      decide: DECIDE,
      draft: DRAFT,
      proposedAction,
    });

    expect(ApprovalArtifactSchema.safeParse(payload.artifact).success).toBe(true);
    expect(payload.artifact).toEqual({
      kind: 'composite',
      summary: 'Post this reply on the support ticket.',
      blocks: [
        { type: 'field', label: 'Ticket', value: 'ST-1001', mono: true },
        { type: 'field', label: 'Subject', value: 'Export to CSV fails' },
        { type: 'body', format: 'text', content: DRAFT.content },
      ],
    });
    expect(payload.decisionHeader).toEqual({
      title: 'Ask support for an update',
      entityMeta: 'ST-1001 · medium priority · quiet 6d',
    });
    expect(payload.assistantRead).toBe(PERCEIVE.summary);
    expect(payload.context).toEqual([
      DECIDE.reasoning,
      'No follow-up sent on this ticket yet',
      '1 reply on the ticket so far',
    ]);
    expect(payload.confidence).toBe(0.9);
  });

  it('shows the stored action, not the draft, when the two differ', () => {
    const payload = buildSupportFollowupApprovalPayload({
      hydrate: makeHydrate(),
      perceive: PERCEIVE,
      decide: DECIDE,
      draft: DRAFT,
      proposedAction: { ...proposedAction, content: 'Stored wording.' },
    });
    expect(JSON.stringify(payload.artifact)).toContain('Stored wording.');
    expect(JSON.stringify(payload.artifact)).not.toContain(DRAFT.content);
  });

  it('counts earlier follow-ups in plain words', () => {
    const one = buildSupportFollowupApprovalPayload({
      hydrate: makeHydrate({}, 1),
      perceive: null,
      decide: null,
      draft: null,
      proposedAction,
    });
    expect(one.context).toContain('1 follow-up already sent on this ticket');
  });

  it('degrades to nulls when the steps are missing, and still shows the proposed reply', () => {
    const payload = buildSupportFollowupApprovalPayload({
      hydrate: null,
      perceive: null,
      decide: null,
      draft: null,
      proposedAction,
    });
    expect(payload.decisionHeader).toBeNull();
    expect(payload.assistantRead).toBeNull();
    expect(payload.context).toBeNull();
    expect(payload.confidence).toBeNull();
    expect(payload.artifact).toMatchObject({ blocks: [{ label: 'Ticket' }, { type: 'body' }] });
    expect(
      buildSupportFollowupApprovalPayload({
        hydrate: null,
        perceive: null,
        decide: null,
        draft: null,
        proposedAction: {},
      }).artifact,
    ).toBeNull();
  });

  it('keeps a model’s out-of-range confidence inside 0..1', () => {
    const at = (confidence: number) =>
      buildSupportFollowupApprovalPayload({
        hydrate: null,
        perceive: null,
        decide: null,
        draft: { ...DRAFT, confidence },
        proposedAction,
      }).confidence;
    expect(at(1.4)).toBe(1);
    expect(at(-2)).toBe(0);
    expect(at(Number.NaN)).toBeNull();
  });
});

describe('ApprovalEnrichmentService', () => {
  const service = new ApprovalEnrichmentService();
  const steps = [
    { kind: DeskEpisodeStepKind.HYDRATE, sequence: 1, output: makeHydrate() as never },
    { kind: DeskEpisodeStepKind.DRAFT, sequence: 4, output: { content: 'first', confidence: 0.5 } },
    { kind: DeskEpisodeStepKind.DRAFT, sequence: 7, output: DRAFT as never },
  ];

  it('uses the reference job’s adapter for its key, reading the latest draft', () => {
    const payload = service.enrich({ responsibilityKey: 'support_followup', proposedAction, steps });
    expect(payload.decisionHeader?.title).toBe('Ask support for an update');
    expect(payload.confidence).toBe(0.9);
  });

  it('returns the empty payload for a key with no adapter', () => {
    expect(service.enrich({ responsibilityKey: 'welcome', proposedAction, steps })).toEqual({
      artifact: null,
      decisionHeader: null,
      assistantRead: null,
      context: null,
      confidence: null,
    });
  });
});

import { CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE } from '../reinforcement-judge';

function memory(
  over: Partial<{
    scope: 'ENTITY' | 'PATTERN' | 'PLAYBOOK';
    polarity: 'REINFORCE' | 'CORRECT';
    entityRef: Record<string, unknown> | null;
  }> = {},
) {
  const entityRef = 'entityRef' in over ? (over.entityRef ?? null) : { customerId: '42' };
  return {
    scope: over.scope ?? 'ENTITY',
    polarity: over.polarity ?? 'REINFORCE',
    content: 'm',
    entityRef,
    entityPredicate: null,
  } as const;
}

describe('CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE', () => {
  it('NEUTRAL when entity mismatches (memory belongs to a different customer)', () => {
    const v = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(memory({ entityRef: { customerId: '99' } }), {
      transition: 'approve_unchanged',
      outcome: 'invoice_drafted',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('CONFIRM — REINFORCE memory + reinforcing transition (approve_unchanged) for the same customer', () => {
    const v = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'approve_unchanged',
      outcome: 'invoice_drafted',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONFIRM');
  });

  it('CONTRADICT — REINFORCE memory + correcting transition (reject) for same customer', () => {
    const v = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'reject',
      outcome: 'rejected_by_operator',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONTRADICT');
  });

  it('CONTRADICT — CORRECT memory + reinforcing transition (approve_unchanged) for same customer', () => {
    const v = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), {
      transition: 'approve_unchanged',
      outcome: 'invoice_drafted',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONTRADICT');
  });

  it('CONFIRM — CORRECT memory + reject transition (operator agreed with the prior "do not bill")', () => {
    const v = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), {
      transition: 'reject_and_close',
      outcome: 'rejected_by_operator',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONFIRM');
  });

  it('NEUTRAL on no_action — Sally chose not to draft; the memory neither reinforced nor contradicted', () => {
    const v = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'no_action',
      outcome: 'no_action_needed',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('NEUTRAL on snooze — operator wanted quiet, NOT a correction', () => {
    const v = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'snooze',
      outcome: 'rejected_by_operator',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('PLAYBOOK rule with no entityRef applies agent-wide', () => {
    const confirm = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(
      memory({ scope: 'PLAYBOOK', polarity: 'REINFORCE', entityRef: null }),
      { transition: 'approve_unchanged', outcome: 'invoice_drafted', entityRef: { customerId: '42' } },
    );
    expect(confirm).toBe('CONFIRM');

    const contradict = CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE(
      memory({ scope: 'PLAYBOOK', polarity: 'REINFORCE', entityRef: null }),
      { transition: 'reject', outcome: 'rejected_by_operator', entityRef: { customerId: '42' } },
    );
    expect(contradict).toBe('CONTRADICT');
  });
});

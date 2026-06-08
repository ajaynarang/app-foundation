import { SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE } from '../reinforcement-judge';

function memory(
  over: Partial<{
    scope: 'ENTITY' | 'PATTERN' | 'PLAYBOOK';
    polarity: 'REINFORCE' | 'CORRECT';
    entityRef: Record<string, unknown> | null;
  }> = {},
) {
  const entityRef = 'entityRef' in over ? (over.entityRef ?? null) : { driverId: 'drv_1' };
  return {
    scope: over.scope ?? 'ENTITY',
    polarity: over.polarity ?? 'REINFORCE',
    content: 'm',
    entityRef,
    entityPredicate: null,
  } as const;
}

describe('SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE', () => {
  it('NEUTRAL when entity mismatches (memory belongs to a different driver)', () => {
    const v = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(memory({ entityRef: { driverId: 'drv_99' } }), {
      transition: 'approve_unchanged',
      outcome: 'settlement_approved',
      entityRef: { driverId: 'drv_1' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('CONFIRM — REINFORCE memory + approve_unchanged for the same driver', () => {
    const v = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'approve_unchanged',
      outcome: 'settlement_approved',
      entityRef: { driverId: 'drv_1' },
    });
    expect(v).toBe('CONFIRM');
  });

  it('CONTRADICT — REINFORCE memory + reject for the same driver', () => {
    const v = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'reject',
      outcome: 'rejected_by_operator',
      entityRef: { driverId: 'drv_1' },
    });
    expect(v).toBe('CONTRADICT');
  });

  it('CONTRADICT — CORRECT memory + approve_unchanged for same driver', () => {
    const v = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), {
      transition: 'approve_unchanged',
      outcome: 'settlement_approved',
      entityRef: { driverId: 'drv_1' },
    });
    expect(v).toBe('CONTRADICT');
  });

  it('CONFIRM — CORRECT memory + reject_and_close (operator agreed with the prior caution)', () => {
    const v = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), {
      transition: 'reject_and_close',
      outcome: 'rejected_by_operator',
      entityRef: { driverId: 'drv_1' },
    });
    expect(v).toBe('CONFIRM');
  });

  it('NEUTRAL on no_action — Sally chose neither', () => {
    const v = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'no_action',
      outcome: 'no_action_needed',
      entityRef: { driverId: 'drv_1' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('NEUTRAL on snooze — operator wanted quiet, not a correction', () => {
    const v = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'snooze',
      outcome: 'rejected_by_operator',
      entityRef: { driverId: 'drv_1' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('PLAYBOOK rule applies agent-wide regardless of entityRef', () => {
    const confirm = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(
      memory({ scope: 'PLAYBOOK', polarity: 'REINFORCE', entityRef: null }),
      { transition: 'approve_unchanged', outcome: 'settlement_approved', entityRef: { driverId: 'drv_1' } },
    );
    expect(confirm).toBe('CONFIRM');

    const contradict = SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE(
      memory({ scope: 'PLAYBOOK', polarity: 'REINFORCE', entityRef: null }),
      { transition: 'reject', outcome: 'rejected_by_operator', entityRef: { driverId: 'drv_1' } },
    );
    expect(contradict).toBe('CONTRADICT');
  });
});

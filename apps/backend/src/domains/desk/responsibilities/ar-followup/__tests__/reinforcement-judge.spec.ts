import { AR_FOLLOWUP_REINFORCEMENT_JUDGE } from '../reinforcement-judge';

function memory(
  over: Partial<{
    scope: 'ENTITY' | 'PATTERN' | 'PLAYBOOK';
    polarity: 'REINFORCE' | 'CORRECT';
    entityRef: Record<string, unknown> | null;
  }> = {},
) {
  // Use the `in` operator so an explicit `entityRef: null` override is
  // honored — `??` would fall through to the default for `null` values.
  const entityRef = 'entityRef' in over ? (over.entityRef ?? null) : { customerId: '42' };
  return {
    scope: over.scope ?? 'ENTITY',
    polarity: over.polarity ?? 'REINFORCE',
    content: 'm',
    entityRef,
    entityPredicate: null,
  } as const;
}

describe('AR_FOLLOWUP_REINFORCEMENT_JUDGE', () => {
  it('NEUTRAL when entity mismatches (memory belongs to a different customer)', () => {
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ entityRef: { customerId: '99' } }), {
      transition: 'approve_unchanged',
      outcome: 'followup_sent',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('NEUTRAL when entityRef is null (pattern/playbook with no key) — covered by overlap rule', () => {
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ entityRef: null, scope: 'PATTERN' }), {
      transition: 'approve_unchanged',
      outcome: 'followup_sent',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('CONFIRM — REINFORCE memory + reinforcing transition (approve_unchanged) for the same customer', () => {
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'approve_unchanged',
      outcome: 'followup_sent',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONFIRM');
  });

  it('CONTRADICT — REINFORCE memory + correcting transition (reject) for same customer', () => {
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'reject',
      outcome: 'rejected_by_operator',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONTRADICT');
  });

  it('CONTRADICT — CORRECT memory + reinforcing transition (approve_unchanged) for same customer', () => {
    // The CORRECT memory said "do not pursue this entity"; the operator approved.
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), {
      transition: 'approve_unchanged',
      outcome: 'followup_sent',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONTRADICT');
  });

  it('CONFIRM — CORRECT memory + reject transition (operator agreed with the prior "do not pursue")', () => {
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), {
      transition: 'reject_and_close',
      outcome: 'rejected_by_operator',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('CONFIRM');
  });

  it('NEUTRAL on no_action — Sally chose not to act; the memory neither reinforced nor contradicted', () => {
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'no_action',
      outcome: 'no_action_needed',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('NEUTRAL on snooze — operator wanted quiet, NOT a correction (regression: snooze must not decay valid memories)', () => {
    // Realistic: Acme is a known late-payer (REINFORCE memory says "always pays
    // around day 50"). Operator gets sick of the daily nag and snoozes for 14d.
    // If we classify snooze as CORRECTING, the memory's confidence decays
    // toward auto-deactivation after a few snoozes — Sally forgets a true
    // lesson. Snooze must stay NEUTRAL.
    const v = AR_FOLLOWUP_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), {
      transition: 'snooze',
      outcome: 'rejected_by_operator',
      entityRef: { customerId: '42' },
    });
    expect(v).toBe('NEUTRAL');
  });

  it('PLAYBOOK rule with no entityRef applies whenever the operator authored guidance is broad', () => {
    // Playbook rules don't carry entityRef but they DO apply agent-wide.
    // Treat as CONFIRM when transition reinforces, CONTRADICT when it corrects.
    const confirm = AR_FOLLOWUP_REINFORCEMENT_JUDGE(
      memory({ scope: 'PLAYBOOK', polarity: 'REINFORCE', entityRef: null }),
      {
        transition: 'approve_unchanged',
        outcome: 'followup_sent',
        entityRef: { customerId: '42' },
      },
    );
    expect(confirm).toBe('CONFIRM');

    const contradict = AR_FOLLOWUP_REINFORCEMENT_JUDGE(
      memory({ scope: 'PLAYBOOK', polarity: 'REINFORCE', entityRef: null }),
      {
        transition: 'reject',
        outcome: 'rejected_by_operator',
        entityRef: { customerId: '42' },
      },
    );
    expect(contradict).toBe('CONTRADICT');
  });
});

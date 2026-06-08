import { DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE } from '../reinforcement-judge';
import type { ReinforcementJudgeContext, ReinforcementMemoryRow } from '../../../core/memory/reinforcement.types';

function memory(overrides: Partial<ReinforcementMemoryRow> = {}): ReinforcementMemoryRow {
  return {
    scope: 'ENTITY',
    polarity: 'REINFORCE',
    content: 'Maria responds to SMS faster than email',
    entityRef: { driverId: 'DRV-1' },
    entityPredicate: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<ReinforcementJudgeContext> = {}): ReinforcementJudgeContext {
  return {
    transition: 'approve_unchanged',
    outcome: 'reminder_sent',
    entityRef: { driverId: 'DRV-1' },
    ...overrides,
  };
}

describe('DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE', () => {
  it('REINFORCE × reinforcing transition (with entityRef overlap) → CONFIRM', () => {
    expect(DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(memory(), ctx({ transition: 'auto_send' }))).toBe('CONFIRM');
  });

  it('REINFORCE × correcting transition → CONTRADICT', () => {
    expect(DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(memory({ polarity: 'REINFORCE' }), ctx({ transition: 'reject' }))).toBe(
      'CONTRADICT',
    );
  });

  it('CORRECT × correcting transition → CONFIRM', () => {
    expect(
      DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), ctx({ transition: 'reject_and_close' })),
    ).toBe('CONFIRM');
  });

  it('CORRECT × reinforcing transition → CONTRADICT', () => {
    expect(
      DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(memory({ polarity: 'CORRECT' }), ctx({ transition: 'approve_unchanged' })),
    ).toBe('CONTRADICT');
  });

  it('snooze → NEUTRAL (operator muted noise, not a correction)', () => {
    expect(DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(memory(), ctx({ transition: 'snooze' }))).toBe('NEUTRAL');
  });

  it('no_action → NEUTRAL', () => {
    expect(DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(memory(), ctx({ transition: 'no_action' }))).toBe('NEUTRAL');
  });

  it('approve_edited → NEUTRAL (the edit is the lesson)', () => {
    expect(DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(memory(), ctx({ transition: 'approve_edited' }))).toBe('NEUTRAL');
  });

  it('entity-scoped memory without entityRef overlap → NEUTRAL', () => {
    expect(
      DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(
        memory({ entityRef: { driverId: 'OTHER' } }),
        ctx({ transition: 'auto_send' }),
      ),
    ).toBe('NEUTRAL');
  });

  it('playbook-scoped memory always applies regardless of entityRef', () => {
    expect(
      DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE(
        memory({ scope: 'PLAYBOOK', entityRef: null }),
        ctx({ transition: 'auto_send' }),
      ),
    ).toBe('CONFIRM');
  });
});

import { RESPONSIBILITY_REGISTRY, findResponsibilityDefinition } from '../..';
import { ToolNames } from '../../../../ai/agent-contract/tool-names.constants';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';
import { supportFollowupConditionsEvaluator } from '../conditions-evaluator';
import { SUPPORT_FOLLOWUP_DEFINITION } from '../definition';
import { evaluatePreflight } from '../preflight';
import { SUPPORT_FOLLOWUP_PROMPT_KEYS, SUPPORT_FOLLOWUP_STEP_PROMPTS } from '../prompts';
import { SUPPORT_FOLLOWUP_REINFORCEMENT_JUDGE as judge } from '../reinforcement-judge';
import { SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS, SupportFollowupConditionsSchema } from '../schemas';
import { makeHydrate } from './fixtures';

describe('support follow-up: definition', () => {
  it('is registered, available, supervised by default, and names only its act tool', () => {
    expect(findResponsibilityDefinition('support_followup')).toBe(SUPPORT_FOLLOWUP_DEFINITION);
    expect(RESPONSIBILITY_REGISTRY).toContain(SUPPORT_FOLLOWUP_DEFINITION);
    expect(SUPPORT_FOLLOWUP_DEFINITION.lifecycle).toBe('AVAILABLE');
    expect(SUPPORT_FOLLOWUP_DEFINITION.defaults.trustLevel).toBe('SUPERVISED');
    expect(SUPPORT_FOLLOWUP_DEFINITION.tools).toEqual([ToolNames.REPLY_TO_SUPPORT_TICKET]);
  });

  it('keeps its schedule declared and a manual run available', () => {
    const kinds = SUPPORT_FOLLOWUP_DEFINITION.triggers.map((t) => t.kind);
    expect(kinds).toEqual(['scheduled', 'manual']);
  });

  it('seeds conditions its own schema accepts, and shows a form field for every one of them', () => {
    expect(SupportFollowupConditionsSchema.parse(SUPPORT_FOLLOWUP_DEFINITION.defaults.conditions)).toEqual(
      SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS,
    );
    expect(SUPPORT_FOLLOWUP_DEFINITION.conditionsUI?.fields.map((f) => f.key).sort()).toEqual(
      Object.keys(SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS).sort(),
    );
  });

  it('fills in defaults for a tenant row written before a condition existed', () => {
    expect(SupportFollowupConditionsSchema.parse({})).toEqual(SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS);
  });

  it('has a prompt for each model step, named desk.<key>.<step>.v<n>', () => {
    expect(Object.keys(SUPPORT_FOLLOWUP_STEP_PROMPTS).sort()).toEqual(
      Object.values(SUPPORT_FOLLOWUP_PROMPT_KEYS).sort(),
    );
    for (const [name, text] of Object.entries(SUPPORT_FOLLOWUP_STEP_PROMPTS)) {
      expect(name).toMatch(/^desk\.support_followup\.(perceive|decide|draft)\.v\d+$/);
      expect(text.length).toBeGreaterThan(100);
    }
  });
});

describe('support follow-up: preflight', () => {
  const base = { status: 'OPEN' as const, daysQuiet: 6, staleAfterDays: 3 };

  it('proceeds for an open ticket that is quiet long enough', () => {
    expect(evaluatePreflight(base)).toEqual({ action: 'proceed' });
    expect(evaluatePreflight({ ...base, status: 'IN_PROGRESS', daysQuiet: 3 })).toEqual({ action: 'proceed' });
  });

  it.each(['RESOLVED', 'CLOSED', 'WAITING_ON_CUSTOMER'] as const)('aborts when the ticket is %s', (status) => {
    expect(evaluatePreflight({ ...base, status })).toMatchObject({
      action: 'abort',
      outcome: DESK_OUTCOMES.PREFLIGHT_ABORTED,
    });
  });

  it('skips when someone replied since the sweep picked the ticket', () => {
    expect(evaluatePreflight({ ...base, daysQuiet: 1 })).toMatchObject({
      action: 'skip',
      outcome: DESK_OUTCOMES.PREFLIGHT_SKIPPED,
    });
  });
});

describe('support follow-up: conditions evaluator', () => {
  const evaluate = (conditions: unknown, hydrate = makeHydrate()) =>
    supportFollowupConditionsEvaluator(conditions, hydrate);

  it('is met for a first follow-up on a medium ticket under the defaults', () => {
    expect(evaluate(SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS)).toEqual({
      conditionsMet: true,
      checks: { followUpCountOk: true, priorityOk: true },
    });
  });

  it('fails once the allowed number of follow-ups was already sent', () => {
    expect(evaluate(SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS, makeHydrate({}, 1))).toEqual({
      conditionsMet: false,
      checks: { followUpCountOk: false, priorityOk: true },
    });
    expect(evaluate({ maxFollowUps: 2 }, makeHydrate({}, 1)).conditionsMet).toBe(true);
  });

  it('fails for a priority the operator did not allow', () => {
    expect(evaluate(SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS, makeHydrate({ priority: 'CRITICAL' }))).toEqual({
      conditionsMet: false,
      checks: { followUpCountOk: true, priorityOk: false },
    });
    expect(evaluate({ autoSendPriorities: [] }).conditionsMet).toBe(false);
  });

  it('uses the defaults when the episode carries no conditions', () => {
    expect(evaluate(null).conditionsMet).toBe(true);
  });

  it('refuses conditions that are not this job’s shape, so a bad row gates instead of passing', () => {
    expect(() => evaluate({ maxFollowUps: 'many' })).toThrow();
  });
});

describe('support follow-up: reinforcement judge', () => {
  const ctx = (transition: string) => ({
    transition,
    outcome: 'followup_sent',
    entityRef: { ticketNumber: 'ST-1001', supportCategory: 'TECHNICAL' },
  });
  const memory = (polarity: 'REINFORCE' | 'CORRECT', scope: 'ENTITY' | 'PATTERN' | 'PLAYBOOK' = 'PATTERN') => ({
    scope,
    polarity,
    content: 'Technical tickets get answered after one nudge.',
    entityRef: { supportCategory: 'TECHNICAL' },
    entityPredicate: null,
  });

  it.each([
    ['REINFORCE', 'auto_send', 'CONFIRM'],
    ['REINFORCE', 'approve_unchanged', 'CONFIRM'],
    ['REINFORCE', 'reject', 'CONTRADICT'],
    ['REINFORCE', 'approval_expired', 'CONTRADICT'],
    ['CORRECT', 'approve_unchanged', 'CONTRADICT'],
    ['CORRECT', 'reject_and_close', 'CONFIRM'],
  ] as const)('%s memory, closed by %s → %s', (polarity, transition, verdict) => {
    expect(judge(memory(polarity), ctx(transition))).toBe(verdict);
  });

  it.each(['no_action', 'approve_edited', 'snooze'])('is neutral when the episode closed by %s', (transition) => {
    expect(judge(memory('REINFORCE'), ctx(transition))).toBe('NEUTRAL');
    expect(judge(memory('CORRECT'), ctx(transition))).toBe('NEUTRAL');
  });

  it('is neutral for a memory about another category or with no reference', () => {
    expect(judge({ ...memory('REINFORCE'), entityRef: { supportCategory: 'BILLING' } }, ctx('auto_send'))).toBe(
      'NEUTRAL',
    );
    expect(judge({ ...memory('REINFORCE'), entityRef: null }, ctx('auto_send'))).toBe('NEUTRAL');
  });

  it('always applies a playbook rule, whatever it points at', () => {
    expect(judge({ ...memory('CORRECT', 'PLAYBOOK'), entityRef: null }, ctx('reject'))).toBe('CONFIRM');
  });
});

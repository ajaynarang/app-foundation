import type { AgentScope, TrustLevel } from '@app/shared-types';
import { decideToolCall, type ToolCaller } from '../tool-policy';

const READ: AgentScope = 'documents:read';
const STANDARD: AgentScope = 'documents:write';
const SENSITIVE: AgentScope = 'platform:write:sensitive';

const job = (
  trustLevel: TrustLevel,
  over: { conditionsMet?: boolean; confidence?: number | null } = {},
): ToolCaller => ({
  kind: 'job',
  trustLevel,
  conditions: { conditionsMet: over.conditionsMet ?? true, checks: { rule: over.conditionsMet ?? true } },
  confidence: over.confidence === undefined ? 0.99 : over.confidence,
});

const EVERY_CALLER: ToolCaller[] = [
  { kind: 'person' },
  { kind: 'outside' },
  { kind: 'cleared-job' },
  job('SUPERVISED'),
  job('ASSISTED'),
  job('AUTONOMOUS'),
];

describe('decideToolCall — the tier outranks the caller', () => {
  it.each(EVERY_CALLER)('a read runs for %j', (caller) => {
    expect(decideToolCall(READ, caller)).toMatchObject({ verdict: 'run', confirmation: 'none', tier: 'read' });
  });

  it.each(EVERY_CALLER)('a sensitive change asks a person for %j', (caller) => {
    expect(decideToolCall(SENSITIVE, caller)).toMatchObject({
      verdict: 'ask',
      confirmation: 'sensitive',
      rule: 'sensitive_always_gates',
    });
  });

  it.each(EVERY_CALLER)('an unknown tool fails closed for %j', (caller) => {
    expect(decideToolCall(null, caller)).toMatchObject({
      verdict: 'ask',
      confirmation: 'sensitive',
      rule: 'unknown_scope_fail_closed',
      tier: null,
    });
  });
});

describe('decideToolCall — a standard change depends on the caller', () => {
  it('asks a person in the assistant', () => {
    expect(decideToolCall(STANDARD, { kind: 'person' })).toMatchObject({ verdict: 'ask', confirmation: 'standard' });
  });

  it('asks for an outside app, key or agent', () => {
    expect(decideToolCall(STANDARD, { kind: 'outside' })).toMatchObject({ verdict: 'ask', confirmation: 'standard' });
  });

  it('runs for a job its gate already cleared', () => {
    expect(decideToolCall(STANDARD, { kind: 'cleared-job' })).toMatchObject({ verdict: 'run', confirmation: 'none' });
  });

  it('a supervised job always asks, however confident', () => {
    expect(decideToolCall(STANDARD, job('SUPERVISED', { confidence: 1 }))).toMatchObject({
      verdict: 'ask',
      rule: 'supervised_gates_standard',
    });
  });

  it('an assisted job runs when its rules pass and it is confident', () => {
    expect(decideToolCall(STANDARD, job('ASSISTED', { confidence: 0.95 }))).toMatchObject({
      verdict: 'run',
      rule: 'assisted_ok',
      threshold: 0.9,
    });
  });

  it('an assisted job asks when its own rules fail', () => {
    expect(decideToolCall(STANDARD, job('ASSISTED', { conditionsMet: false }))).toMatchObject({
      verdict: 'ask',
      rule: 'assisted_conditions_failed',
      checks: { rule: false },
    });
  });

  it('an assisted job asks below 0.90', () => {
    expect(decideToolCall(STANDARD, job('ASSISTED', { confidence: 0.89 }))).toMatchObject({
      verdict: 'ask',
      rule: 'assisted_confidence_below_threshold',
    });
  });

  it('an autonomous job runs at 0.75 and asks below it', () => {
    expect(decideToolCall(STANDARD, job('AUTONOMOUS', { confidence: 0.75 })).verdict).toBe('run');
    expect(decideToolCall(STANDARD, job('AUTONOMOUS', { confidence: 0.74 }))).toMatchObject({
      verdict: 'ask',
      rule: 'autonomous_confidence_below_threshold',
    });
  });

  it('a job that reported no confidence is judged on level and rules alone', () => {
    expect(decideToolCall(STANDARD, job('ASSISTED', { confidence: null })).verdict).toBe('run');
    expect(decideToolCall(STANDARD, job('AUTONOMOUS', { confidence: null })).verdict).toBe('run');
  });
});

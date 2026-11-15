import { agentActionReturnPath } from '../return-to';

describe('agentActionReturnPath', () => {
  it('returns an agent approval page of this app', () => {
    expect(agentActionReturnPath(`?returnTo=${encodeURIComponent('/agent-actions/17/approve')}`)).toBe(
      '/agent-actions/17/approve',
    );
  });

  it('refuses anything else, so returnTo is never an open redirect', () => {
    for (const value of [
      'https://evil.example.com/agent-actions/17/approve',
      '//evil.example.com/agent-actions/17/approve',
      '/settings/billing',
      '/agent-actions/17/approve/../../../settings',
      '/agent-actions/17/approve?x=1',
    ]) {
      expect(agentActionReturnPath(`?returnTo=${encodeURIComponent(value)}`)).toBeNull();
    }
    expect(agentActionReturnPath('')).toBeNull();
  });
});

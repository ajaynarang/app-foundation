import { AgentScopeSchema, SCOPE_DESCRIPTIONS } from '../agent-scopes.schema';

describe('SCOPE_DESCRIPTIONS', () => {
  it('covers every AgentScope enum value', () => {
    for (const scope of AgentScopeSchema.options) {
      expect(SCOPE_DESCRIPTIONS).toHaveProperty(scope);
      expect(SCOPE_DESCRIPTIONS[scope].summary.length).toBeGreaterThan(0);
    }
  });

  it('entry shape is { summary, grantsPlainEnglish, hitlTier, sampleTools[] }', () => {
    const entry = SCOPE_DESCRIPTIONS['documents:write'];
    expect(entry).toEqual(
      expect.objectContaining({
        summary: expect.any(String),
        grantsPlainEnglish: expect.any(String),
        hitlTier: expect.stringMatching(/^(none|standard|sensitive)$/),
        sampleTools: expect.any(Array),
      }),
    );
  });

  it('marks platform:admin as non-grantable', () => {
    expect(SCOPE_DESCRIPTIONS['platform:admin'].hitlTier).toBe('sensitive');
    expect(SCOPE_DESCRIPTIONS['platform:admin'].grantsPlainEnglish.toLowerCase()).toContain('never');
  });
});

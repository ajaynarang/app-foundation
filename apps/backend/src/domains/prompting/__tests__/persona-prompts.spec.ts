import { ASSISTANT_SYSTEM_PROMPT, SUPPORT_SYSTEM_PROMPT } from '../prompts/persona/system-prompts.fallback';

describe('System Prompt Fallbacks', () => {
  it('should export ASSISTANT_SYSTEM_PROMPT as a non-empty string', () => {
    expect(typeof ASSISTANT_SYSTEM_PROMPT).toBe('string');
    expect(ASSISTANT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('assistant');
  });

  it('should export SUPPORT_SYSTEM_PROMPT with the support workflow', () => {
    expect(typeof SUPPORT_SYSTEM_PROMPT).toBe('string');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('support');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('create-support-ticket');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('SUPPORT WORKFLOW');
  });

  it('all prompts should include follow-up instructions', () => {
    for (const prompt of [ASSISTANT_SYSTEM_PROMPT, SUPPORT_SYSTEM_PROMPT]) {
      expect(prompt).toContain('FOLLOW-UP SUGGESTIONS');
      expect(prompt).toContain('<followups>');
    }
  });

  it('all prompts should reference the product knowledge base', () => {
    for (const prompt of [ASSISTANT_SYSTEM_PROMPT, SUPPORT_SYSTEM_PROMPT]) {
      expect(prompt).toContain('search-kb');
    }
  });
});

import {
  PROSPECT_SYSTEM_PROMPT,
  DISPATCHER_SYSTEM_PROMPT,
  OWNER_SYSTEM_PROMPT,
  ADMIN_SYSTEM_PROMPT,
  SUPER_ADMIN_SYSTEM_PROMPT,
  DRIVER_SYSTEM_PROMPT,
  CUSTOMER_SYSTEM_PROMPT,
  SUPPORT_SYSTEM_PROMPT,
} from '../prompts/persona/system-prompts.fallback';

describe('System Prompt Fallbacks', () => {
  it('should export PROSPECT_SYSTEM_PROMPT as non-empty string', () => {
    expect(typeof PROSPECT_SYSTEM_PROMPT).toBe('string');
    expect(PROSPECT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(PROSPECT_SYSTEM_PROMPT).toContain('SALLY');
    expect(PROSPECT_SYSTEM_PROMPT).toContain('prospective');
  });

  it('should export DISPATCHER_SYSTEM_PROMPT with dispatcher tools', () => {
    expect(typeof DISPATCHER_SYSTEM_PROMPT).toBe('string');
    expect(DISPATCHER_SYSTEM_PROMPT).toContain('dispatcher');
    expect(DISPATCHER_SYSTEM_PROMPT).toContain('assign-load');
    expect(DISPATCHER_SYSTEM_PROMPT).toContain('query-loads');
    expect(DISPATCHER_SYSTEM_PROMPT).toContain('CONFIRMATION RULES');
  });

  it('should export OWNER_SYSTEM_PROMPT', () => {
    expect(typeof OWNER_SYSTEM_PROMPT).toBe('string');
    expect(OWNER_SYSTEM_PROMPT).toContain('owner');
    expect(OWNER_SYSTEM_PROMPT).toContain('GUARDRAILS');
  });

  it('should export ADMIN_SYSTEM_PROMPT', () => {
    expect(typeof ADMIN_SYSTEM_PROMPT).toBe('string');
    expect(ADMIN_SYSTEM_PROMPT).toContain('administrator');
    expect(ADMIN_SYSTEM_PROMPT).toContain('CONFIRMATION RULES');
  });

  it('should export SUPER_ADMIN_SYSTEM_PROMPT', () => {
    expect(typeof SUPER_ADMIN_SYSTEM_PROMPT).toBe('string');
    expect(SUPER_ADMIN_SYSTEM_PROMPT).toContain('super admin');
    expect(SUPER_ADMIN_SYSTEM_PROMPT).toContain('platform admin UI');
  });

  it('should export DRIVER_SYSTEM_PROMPT with driver-specific tools', () => {
    expect(typeof DRIVER_SYSTEM_PROMPT).toBe('string');
    expect(DRIVER_SYSTEM_PROMPT).toContain('driver');
    expect(DRIVER_SYSTEM_PROMPT).toContain('get-my-route');
    expect(DRIVER_SYSTEM_PROMPT).toContain('get-my-hos');
    expect(DRIVER_SYSTEM_PROMPT).toContain('report-delay');
  });

  it('should export CUSTOMER_SYSTEM_PROMPT with customer language rules', () => {
    expect(typeof CUSTOMER_SYSTEM_PROMPT).toBe('string');
    expect(CUSTOMER_SYSTEM_PROMPT).toContain('customer');
    expect(CUSTOMER_SYSTEM_PROMPT).toContain('shipment');
    expect(CUSTOMER_SYSTEM_PROMPT).toContain('LANGUAGE RULES');
  });

  it('should export SUPPORT_SYSTEM_PROMPT with ticket workflow', () => {
    expect(typeof SUPPORT_SYSTEM_PROMPT).toBe('string');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('support');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('create-support-ticket');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('SUPPORT WORKFLOW');
  });

  it('all prompts should include follow-up instructions', () => {
    const prompts = [
      PROSPECT_SYSTEM_PROMPT,
      DISPATCHER_SYSTEM_PROMPT,
      OWNER_SYSTEM_PROMPT,
      ADMIN_SYSTEM_PROMPT,
      SUPER_ADMIN_SYSTEM_PROMPT,
      DRIVER_SYSTEM_PROMPT,
      CUSTOMER_SYSTEM_PROMPT,
      SUPPORT_SYSTEM_PROMPT,
    ];
    for (const prompt of prompts) {
      expect(prompt).toContain('FOLLOW-UP SUGGESTIONS');
      expect(prompt).toContain('<followups>');
    }
  });

  it('authenticated prompts should include product help block', () => {
    const authenticatedPrompts = [
      DISPATCHER_SYSTEM_PROMPT,
      OWNER_SYSTEM_PROMPT,
      ADMIN_SYSTEM_PROMPT,
      SUPER_ADMIN_SYSTEM_PROMPT,
      DRIVER_SYSTEM_PROMPT,
      CUSTOMER_SYSTEM_PROMPT,
      SUPPORT_SYSTEM_PROMPT,
    ];
    for (const prompt of authenticatedPrompts) {
      expect(prompt).toContain('search-kb');
    }
  });
});

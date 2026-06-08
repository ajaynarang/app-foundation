import { CATCH_ME_UP_FALLBACK } from '../catch-me-up.fallback';

describe('CATCH_ME_UP_FALLBACK', () => {
  it('declares all required mustache variables', () => {
    const required = ['{{timeOfDay}}', '{{tenantName}}', '{{now}}', '{{userRole}}'];
    for (const v of required) {
      expect(CATCH_ME_UP_FALLBACK.includes(v)).toBe(true);
    }
  });

  it('mentions every current platform capability we want covered', () => {
    const capabilities = [
      'load',
      'driver',
      'HOS',
      'Shield',
      'route',
      'ETA',
      'alert',
      'document',
      'invoice',
      'settlement',
      'Samsara',
      'QuickBooks',
    ];
    for (const c of capabilities) {
      expect(CATCH_ME_UP_FALLBACK.toLowerCase()).toContain(c.toLowerCase());
    }
  });

  it('contains time-of-day framing instructions', () => {
    expect(CATCH_ME_UP_FALLBACK).toMatch(/morning/i);
    expect(CATCH_ME_UP_FALLBACK).toMatch(/midday/i);
    expect(CATCH_ME_UP_FALLBACK).toMatch(/evening/i);
  });

  it('ends with a call-to-action to continue the conversation', () => {
    expect(CATCH_ME_UP_FALLBACK).toMatch(/Anything I should jump on\?/);
  });
});

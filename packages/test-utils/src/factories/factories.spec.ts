import { describe, it, expect } from 'vitest';
import { buildUser, buildUserInvitation, buildExampleItem, buildSupportTicket } from './index.js';

describe('factories', () => {
  it('buildUser produces unique emails across calls', () => {
    const a = buildUser();
    const b = buildUser();
    expect(a.email).not.toBe(b.email);
    expect(a.email).toMatch(/@test\.example\.com$/);
  });

  it('buildUserInvitation defaults to the MEMBER role', () => {
    expect(buildUserInvitation().role).toBe('MEMBER');
  });

  it('overrides take precedence over defaults', () => {
    const u = buildUser({ firstName: 'Override' });
    expect(u.firstName).toBe('Override');
    const item = buildExampleItem({ quantity: 42 });
    expect(item.quantity).toBe(42);
  });

  it('buildSupportTicket emits a valid default payload', () => {
    const t = buildSupportTicket();
    expect(t.subject.length).toBeGreaterThan(0);
  });
});

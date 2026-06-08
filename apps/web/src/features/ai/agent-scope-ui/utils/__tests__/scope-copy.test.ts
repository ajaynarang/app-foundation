import { scopeChipClass, groupScopesByDomain } from '../scope-copy';

describe('scope-copy utils', () => {
  describe('scopeChipClass', () => {
    it('uses caution (yellow) for sensitive scopes', () => {
      expect(scopeChipClass('fleet:write:sensitive')).toContain('yellow-500');
    });
    it('uses primary tint for standard (write) scopes', () => {
      expect(scopeChipClass('loads:write')).toContain('primary');
    });
    it('uses muted for read scopes', () => {
      expect(scopeChipClass('fleet:read')).toContain('muted');
    });
    it('uses caution for comms:send:bulk', () => {
      expect(scopeChipClass('comms:send:bulk')).toContain('yellow-500');
    });
    it('uses caution for platform:admin (even though it is ungrantable)', () => {
      expect(scopeChipClass('platform:admin')).toContain('yellow-500');
    });
  });

  describe('groupScopesByDomain', () => {
    it('groups scopes by their domain prefix', () => {
      const grouped = groupScopesByDomain(['fleet:read', 'fleet:write', 'loads:read']);
      expect(grouped).toEqual({
        fleet: ['fleet:read', 'fleet:write'],
        loads: ['loads:read'],
      });
    });

    it('handles sensitive suffix correctly', () => {
      const grouped = groupScopesByDomain(['invoices:write', 'invoices:write:sensitive']);
      expect(grouped.invoices).toEqual(['invoices:write', 'invoices:write:sensitive']);
    });
  });
});

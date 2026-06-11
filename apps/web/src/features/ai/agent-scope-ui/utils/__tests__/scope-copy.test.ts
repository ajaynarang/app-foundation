import { scopeChipClass, groupScopesByDomain } from '../scope-copy';

describe('scope-copy utils', () => {
  describe('scopeChipClass', () => {
    it('uses caution (yellow) for sensitive scopes', () => {
      expect(scopeChipClass('platform:write:sensitive')).toContain('yellow-500');
    });
    it('uses primary tint for standard (write) scopes', () => {
      expect(scopeChipClass('documents:write')).toContain('primary');
    });
    it('uses muted for read scopes', () => {
      expect(scopeChipClass('documents:read')).toContain('muted');
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
      const grouped = groupScopesByDomain(['documents:read', 'documents:write', 'comms:send']);
      expect(grouped).toEqual({
        documents: ['documents:read', 'documents:write'],
        comms: ['comms:send'],
      });
    });

    it('handles sensitive suffix correctly', () => {
      const grouped = groupScopesByDomain(['integrations:write', 'integrations:write:sensitive']);
      expect(grouped.integrations).toEqual(['integrations:write', 'integrations:write:sensitive']);
    });
  });
});

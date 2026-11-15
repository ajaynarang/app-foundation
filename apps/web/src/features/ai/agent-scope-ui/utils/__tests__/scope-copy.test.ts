import { toneBadgeClass } from '@app/ui';
import { scopeChipClass, groupScopesByDomain, credentialStatus } from '../scope-copy';

describe('scope-copy utils', () => {
  describe('scopeChipClass', () => {
    it('wears the warning tone for sensitive scopes', () => {
      expect(scopeChipClass('platform:write:sensitive')).toBe(toneBadgeClass('warning'));
    });
    it('wears the info tone for standard (write) scopes', () => {
      expect(scopeChipClass('documents:write')).toBe(toneBadgeClass('info'));
    });
    it('wears the neutral tone for read scopes', () => {
      expect(scopeChipClass('documents:read')).toBe(toneBadgeClass('neutral'));
    });
    it('wears the warning tone for comms:send:bulk', () => {
      expect(scopeChipClass('comms:send:bulk')).toBe(toneBadgeClass('warning'));
    });
    it('wears the warning tone for platform:admin (even though it is ungrantable)', () => {
      expect(scopeChipClass('platform:admin')).toBe(toneBadgeClass('warning'));
    });
  });

  describe('credentialStatus', () => {
    it('reads a revoked credential as Revoked whatever its active flag', () => {
      expect(credentialStatus({ isActive: true, revokedAt: '2026-01-01T00:00:00.000Z' })).toEqual({
        label: 'Revoked',
        tone: 'danger',
      });
    });
    it('reads an inactive credential as Paused, an active one as Active', () => {
      expect(credentialStatus({ isActive: false })).toEqual({ label: 'Paused', tone: 'warning' });
      expect(credentialStatus({ isActive: true, revokedAt: null })).toEqual({ label: 'Active', tone: 'info' });
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

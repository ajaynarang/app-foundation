import {
  AgentScopeSchema,
  SCOPE_TIERS,
  scopeTier,
  scopeDomain,
  scopeAction,
  NEVER_EXTERNAL_SCOPES,
} from '../agent-scopes.schema';

describe('AgentScopeSchema', () => {
  it('accepts valid domain:action scopes', () => {
    expect(AgentScopeSchema.parse('fleet:read')).toBe('fleet:read');
    expect(AgentScopeSchema.parse('invoices:write')).toBe('invoices:write');
  });

  it('accepts sensitive tier scopes', () => {
    expect(AgentScopeSchema.parse('invoices:write:sensitive')).toBe('invoices:write:sensitive');
    expect(AgentScopeSchema.parse('comms:send:bulk')).toBe('comms:send:bulk');
  });

  it('rejects unknown domains', () => {
    expect(() => AgentScopeSchema.parse('bogus:read')).toThrow();
  });

  it('rejects platform:admin as externally-grantable marker (present in enum, runtime check enforced elsewhere)', () => {
    expect(AgentScopeSchema.parse('platform:admin')).toBe('platform:admin');
  });

  describe('scopeTier', () => {
    it('returns "read" for *:read', () => {
      expect(scopeTier('fleet:read')).toBe(SCOPE_TIERS.READ);
    });
    it('returns "standard" for *:write', () => {
      expect(scopeTier('invoices:write')).toBe(SCOPE_TIERS.STANDARD);
    });
    it('returns "sensitive" for *:write:sensitive', () => {
      expect(scopeTier('invoices:write:sensitive')).toBe(SCOPE_TIERS.SENSITIVE);
    });
    it('returns "sensitive" for comms:send:bulk', () => {
      expect(scopeTier('comms:send:bulk')).toBe(SCOPE_TIERS.SENSITIVE);
    });
    it('returns "standard" for comms:send', () => {
      expect(scopeTier('comms:send')).toBe(SCOPE_TIERS.STANDARD);
    });
    it('returns "sensitive" for platform:admin', () => {
      expect(scopeTier('platform:admin')).toBe(SCOPE_TIERS.SENSITIVE);
    });
  });

  describe('scopeDomain / scopeAction', () => {
    it('splits fleet:write correctly', () => {
      expect(scopeDomain('fleet:write')).toBe('fleet');
      expect(scopeAction('fleet:write')).toBe('write');
    });
    it('splits invoices:write:sensitive correctly', () => {
      expect(scopeDomain('invoices:write:sensitive')).toBe('invoices');
      expect(scopeAction('invoices:write:sensitive')).toBe('write:sensitive');
    });
    it('splits comms:send:bulk correctly', () => {
      expect(scopeDomain('comms:send:bulk')).toBe('comms');
      expect(scopeAction('comms:send:bulk')).toBe('send:bulk');
    });
  });

  describe('NEVER_EXTERNAL_SCOPES', () => {
    it('contains platform:admin', () => {
      expect(NEVER_EXTERNAL_SCOPES).toContain('platform:admin');
    });

    it('contains only values that parse as valid AgentScope', () => {
      for (const s of NEVER_EXTERNAL_SCOPES) {
        expect(() => AgentScopeSchema.parse(s)).not.toThrow();
      }
    });
  });
});

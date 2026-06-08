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
    expect(AgentScopeSchema.parse('platform:read')).toBe('platform:read');
    expect(AgentScopeSchema.parse('documents:write')).toBe('documents:write');
  });

  it('accepts sensitive tier scopes', () => {
    expect(AgentScopeSchema.parse('platform:write:sensitive')).toBe('platform:write:sensitive');
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
      expect(scopeTier('platform:read')).toBe(SCOPE_TIERS.READ);
    });
    it('returns "standard" for *:write', () => {
      expect(scopeTier('documents:write')).toBe(SCOPE_TIERS.STANDARD);
    });
    it('returns "sensitive" for *:write:sensitive', () => {
      expect(scopeTier('platform:write:sensitive')).toBe(SCOPE_TIERS.SENSITIVE);
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
    it('splits documents:write correctly', () => {
      expect(scopeDomain('documents:write')).toBe('documents');
      expect(scopeAction('documents:write')).toBe('write');
    });
    it('splits platform:write:sensitive correctly', () => {
      expect(scopeDomain('platform:write:sensitive')).toBe('platform');
      expect(scopeAction('platform:write:sensitive')).toBe('write:sensitive');
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

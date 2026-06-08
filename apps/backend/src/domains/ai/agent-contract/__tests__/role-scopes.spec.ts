import { AgentScopeSchema } from '@app/shared-types';
import { scopesForRole } from '../role-scopes';

describe('scopesForRole', () => {
  it('SUPER_ADMIN receives every scope including platform:admin', () => {
    const scopes = scopesForRole('SUPER_ADMIN');
    expect(scopes).toContain('platform:admin');
    expect(scopes).toContain('platform:write:sensitive');
    expect(scopes).toContain('integrations:write:sensitive');
    expect(scopes).toContain('comms:send:bulk');
  });

  it('OWNER and ADMIN receive tenant admin scopes (no platform:admin)', () => {
    for (const role of ['OWNER', 'ADMIN']) {
      const scopes = scopesForRole(role);
      expect(scopes).not.toContain('platform:admin');
      expect(scopes).toContain('platform:write:sensitive');
      expect(scopes).toContain('integrations:write:sensitive');
      expect(scopes).toContain('comms:send:bulk');
    }
  });

  it('MEMBER receives standard scopes (sensitive admin scopes omitted)', () => {
    const scopes = scopesForRole('MEMBER');
    expect(scopes).toContain('platform:write');
    expect(scopes).toContain('documents:write');
    expect(scopes).toContain('comms:send:bulk');
    // sensitive scopes intentionally omitted — those are admin-only
    expect(scopes).not.toContain('platform:write:sensitive');
    expect(scopes).not.toContain('integrations:write:sensitive');
    expect(scopes).not.toContain('platform:admin');
  });

  it('lowercase role names (userMode format) resolve the same', () => {
    expect(scopesForRole('member')).toEqual(scopesForRole('MEMBER'));
    expect(scopesForRole('owner')).toEqual(scopesForRole('OWNER'));
  });

  it('unknown role resolves fail-closed (empty set)', () => {
    expect(scopesForRole('guest')).toEqual([]);
    expect(scopesForRole('')).toEqual([]);
    expect(scopesForRole('NOT_A_ROLE')).toEqual([]);
  });

  it('SUPER_ADMIN scope set is exactly AgentScopeSchema.options (no drift)', () => {
    // Guards against role-scopes.ts forgetting to pick up a new scope added
    // to the shared-types enum.
    expect(new Set(scopesForRole('SUPER_ADMIN'))).toEqual(new Set(AgentScopeSchema.options));
  });

  it('OWNER scope set is every scope except platform:admin (derived)', () => {
    const owner = new Set(scopesForRole('OWNER'));
    const expected = new Set(AgentScopeSchema.options.filter((s) => s !== 'platform:admin'));
    expect(owner).toEqual(expected);
  });
});

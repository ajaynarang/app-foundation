import { AgentScopeSchema } from '@sally/shared-types';
import { scopesForRole } from '../role-scopes';

describe('scopesForRole', () => {
  it('SUPER_ADMIN receives every scope including platform:admin', () => {
    const scopes = scopesForRole('SUPER_ADMIN');
    expect(scopes).toContain('platform:admin');
    expect(scopes).toContain('fleet:write:sensitive');
    expect(scopes).toContain('loads:write:sensitive');
    expect(scopes).toContain('invoices:write:sensitive');
    expect(scopes).toContain('comms:send:bulk');
  });

  it('OWNER and ADMIN receive tenant admin scopes (no platform:admin)', () => {
    for (const role of ['OWNER', 'ADMIN']) {
      const scopes = scopesForRole(role);
      expect(scopes).not.toContain('platform:admin');
      expect(scopes).toContain('fleet:write:sensitive');
      expect(scopes).toContain('settlements:write:sensitive');
      expect(scopes).toContain('integrations:write:sensitive');
      expect(scopes).toContain('comms:send:bulk');
      expect(scopes).toContain('desk:write:sensitive');
    }
  });

  it('DISPATCHER receives sensitive writes (HITL tier still forces PIN step-up)', () => {
    const scopes = scopesForRole('DISPATCHER');
    expect(scopes).toContain('loads:write:sensitive');
    expect(scopes).toContain('invoices:write:sensitive');
    expect(scopes).toContain('fleet:write:sensitive');
    expect(scopes).toContain('comms:send:bulk');
    // integrations:write:sensitive intentionally omitted — that's admin-only
    expect(scopes).not.toContain('integrations:write:sensitive');
    // desk:write:sensitive is admin-only (enable/disable desk agents)
    expect(scopes).not.toContain('desk:write:sensitive');
    expect(scopes).not.toContain('platform:admin');
    expect(scopes).not.toContain('platform:write');
  });

  it('DRIVER gets narrow read scopes + comms', () => {
    const scopes = scopesForRole('DRIVER');
    expect(scopes).toEqual(['fleet:read', 'loads:read', 'documents:read', 'alerts:read', 'comms:send']);
  });

  it('CUSTOMER gets read-only for their own loads + documents', () => {
    const scopes = scopesForRole('CUSTOMER');
    expect(scopes).toEqual(['loads:read', 'documents:read']);
  });

  it('lowercase role names (userMode format) resolve the same', () => {
    expect(scopesForRole('dispatcher')).toEqual(scopesForRole('DISPATCHER'));
    expect(scopesForRole('owner')).toEqual(scopesForRole('OWNER'));
  });

  it('unknown role resolves fail-closed (empty set)', () => {
    expect(scopesForRole('prospect')).toEqual([]);
    expect(scopesForRole('support')).toEqual([]);
    expect(scopesForRole('')).toEqual([]);
    expect(scopesForRole('NOT_A_ROLE')).toEqual([]);
  });

  it('SUPER_ADMIN scope set is exactly AgentScopeSchema.options (no drift)', () => {
    // Guards against role-scopes.ts forgetting to pick up a new scope added
    // to the shared-types enum. If this fires, either (a) add the new scope
    // to the right role explicitly or (b) confirm SUPER_ADMIN gains it
    // automatically via the ALL_SCOPES_INCLUDING_ADMIN derivation.
    expect(new Set(scopesForRole('SUPER_ADMIN'))).toEqual(new Set(AgentScopeSchema.options));
  });

  it('OWNER scope set is every scope except platform:admin (derived)', () => {
    const owner = new Set(scopesForRole('OWNER'));
    const expected = new Set(AgentScopeSchema.options.filter((s) => s !== 'platform:admin'));
    expect(owner).toEqual(expected);
  });
});

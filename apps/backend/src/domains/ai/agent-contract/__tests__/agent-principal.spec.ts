import {
  fromUser,
  fromOAuthUser,
  fromApiKey,
  fromDeskResponsibility,
  principalAuditLabel,
  principalTrustTier,
} from '../agent-principal';

describe('AgentPrincipal factories', () => {
  it('fromUser builds a user principal', () => {
    const p = fromUser({ userId: 42, tenantId: 7, role: 'DISPATCHER' });
    expect(p).toEqual({
      kind: 'user',
      userId: 42,
      tenantId: 7,
      role: 'DISPATCHER',
      scopes: [],
      authMethod: 'jwt',
      auditId: 'user:42',
    });
  });

  it('fromOAuthUser builds an oauth_client principal', () => {
    const p = fromOAuthUser({
      onBehalfOfUserDbId: 99,
      tenantDbId: 7,
      role: 'DISPATCHER',
      scopes: ['fleet:read'],
      clientId: 'gpt-abc',
    });
    expect(p.kind).toBe('oauth_client');
    if (p.kind !== 'oauth_client') throw new Error('narrow');
    expect(p.clientId).toBe('gpt-abc');
    expect(p.onBehalfOfUserId).toBe(99);
    expect(p.scopes).toEqual(['fleet:read']);
    expect(p.auditId).toBe('oauth:gpt-abc');
  });

  it('fromOAuthUser rejects non-numeric user id (guards against NaN coercion)', () => {
    expect(() =>
      fromOAuthUser({
        onBehalfOfUserDbId: Number('user_demo_owner'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: [],
        clientId: 'c',
      }),
    ).toThrow(/positive integer DB id/);
  });

  it('fromUser rejects NaN/negative/float user id', () => {
    expect(() => fromUser({ userId: NaN, tenantId: 1, role: 'ADMIN' })).toThrow(/positive integer DB id/);
    expect(() => fromUser({ userId: 1.5, tenantId: 1, role: 'ADMIN' })).toThrow(/positive integer DB id/);
    expect(() => fromUser({ userId: 0, tenantId: 1, role: 'ADMIN' })).toThrow(/positive integer DB id/);
    expect(() => fromUser({ userId: -1, tenantId: 1, role: 'ADMIN' })).toThrow(/positive integer DB id/);
  });

  it('fromApiKey builds an api_key principal', () => {
    const p = fromApiKey({
      apiKeyId: 123,
      tenantId: 7,
      userId: 42,
      scopes: ['fleet:read'],
      ipAllowlist: ['10.0.0.1'],
    });
    expect(p.kind).toBe('api_key');
    if (p.kind !== 'api_key') throw new Error('narrow');
    expect(p.apiKeyId).toBe(123);
    expect(p.ipAllowlist).toEqual(['10.0.0.1']);
    expect(p.auditId).toBe('apikey:123');
  });

  it('fromDeskResponsibility builds a desk principal', () => {
    const p = fromDeskResponsibility({
      responsibilityId: 5,
      tenantId: 7,
      scopes: ['loads:write'],
      enabledByUserId: 42,
    });
    expect(p.kind).toBe('desk_responsibility');
    if (p.kind !== 'desk_responsibility') throw new Error('narrow');
    expect(p.auditId).toBe('desk:5');
  });

  it('principalTrustTier returns first_party for user and desk, third_party otherwise', () => {
    const u = fromUser({ userId: 1, tenantId: 1, role: 'ADMIN' });
    const d = fromDeskResponsibility({
      responsibilityId: 1,
      tenantId: 1,
      scopes: [],
      enabledByUserId: 1,
    });
    const o = fromOAuthUser({
      onBehalfOfUserDbId: 1,
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: [],
      clientId: 'c',
    });
    const k = fromApiKey({ apiKeyId: 99, tenantId: 1, userId: 1, scopes: [] });
    expect(principalTrustTier(u)).toBe('first_party');
    expect(principalTrustTier(d)).toBe('first_party');
    expect(principalTrustTier(o)).toBe('third_party');
    expect(principalTrustTier(k)).toBe('third_party');
  });

  it('principalAuditLabel is human-readable per kind', () => {
    expect(principalAuditLabel(fromUser({ userId: 42, tenantId: 7, role: 'DISPATCHER' }))).toBe('user:42');
    expect(
      principalAuditLabel(
        fromOAuthUser({
          onBehalfOfUserDbId: 1,
          tenantDbId: 7,
          role: 'ADMIN',
          scopes: [],
          clientId: 'gpt-abc',
        }),
      ),
    ).toBe('oauth:gpt-abc');
  });
});

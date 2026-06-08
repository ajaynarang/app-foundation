import { HitlPolicyService, HitlTier } from '../hitl-policy.service';
import { fromUser, fromOAuthUser, fromApiKey, fromDeskResponsibility } from '../agent-principal';

describe('HitlPolicyService', () => {
  const svc = new HitlPolicyService();

  it('returns "none" for any read scope, any principal', () => {
    const u = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });
    const o = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'DISPATCHER',
      scopes: [],
      clientId: 'c',
    });
    expect(svc.resolveTier('fleet:read', u)).toBe<HitlTier>('none');
    expect(svc.resolveTier('invoices:read', o)).toBe<HitlTier>('none');
  });

  it('returns "standard" for a standard write by a user principal (inline confirm)', () => {
    const u = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });
    expect(svc.resolveTier('loads:write', u)).toBe<HitlTier>('standard');
  });

  it('returns "sensitive" for a sensitive write by a user principal', () => {
    const u = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });
    expect(svc.resolveTier('invoices:write:sensitive', u)).toBe<HitlTier>('sensitive');
  });

  it('returns "none" for a desk principal on a standard write (pre-authorized at enable)', () => {
    const d = fromDeskResponsibility({
      responsibilityId: 1,
      tenantId: 1,
      scopes: ['loads:write'],
      enabledByUserId: 1,
    });
    expect(svc.resolveTier('loads:write', d)).toBe<HitlTier>('none');
  });

  it('returns "sensitive" for a desk principal on a sensitive write (guardrail + review-inbox in executor)', () => {
    const d = fromDeskResponsibility({
      responsibilityId: 1,
      tenantId: 1,
      scopes: ['invoices:write:sensitive'],
      enabledByUserId: 1,
    });
    expect(svc.resolveTier('invoices:write:sensitive', d)).toBe<HitlTier>('sensitive');
  });

  it('returns "standard" for an OAuth client on a standard write', () => {
    const o = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'DISPATCHER',
      scopes: ['loads:write'],
      clientId: 'c',
    });
    expect(svc.resolveTier('loads:write', o)).toBe<HitlTier>('standard');
  });

  it('returns "sensitive" for an OAuth client on a sensitive write', () => {
    const o = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['invoices:write:sensitive'],
      clientId: 'c',
    });
    expect(svc.resolveTier('invoices:write:sensitive', o)).toBe<HitlTier>('sensitive');
  });

  it('returns "standard" for an API key on a standard write', () => {
    const k = fromApiKey({
      apiKeyId: 1,
      tenantId: 1,
      userId: 1,
      scopes: ['loads:write'],
    });
    expect(svc.resolveTier('loads:write', k)).toBe<HitlTier>('standard');
  });

  it('tokenTtlSeconds(standard) = 300, tokenTtlSeconds(sensitive) = 120', () => {
    expect(svc.tokenTtlSeconds('standard')).toBe(300);
    expect(svc.tokenTtlSeconds('sensitive')).toBe(120);
    expect(svc.tokenTtlSeconds('none')).toBe(0);
  });
});

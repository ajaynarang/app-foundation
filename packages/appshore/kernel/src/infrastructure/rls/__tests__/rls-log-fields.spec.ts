import { rlsStorage } from '../rls-context';
import { rlsLogFields } from '../rls-log-fields';

describe('rlsLogFields', () => {
  it('adds nothing outside any RLS scope', () => {
    expect(rlsLogFields()).toEqual({});
  });

  it('reports rls.kind=none inside a scope with no tenant', () => {
    rlsStorage.run({}, () => {
      expect(rlsLogFields()).toEqual({ 'rls.kind': 'none' });
    });
  });

  it('reports the tenant id and source for a tenant scope', () => {
    rlsStorage.run({ ctx: { kind: 'tenant', tenantId: 42, source: 'jwt' } }, () => {
      expect(rlsLogFields()).toEqual({ 'rls.kind': 'tenant', 'rls.tenant': '42', 'rls.source': 'jwt' });
    });
  });

  it('reports a public scope without a tenant', () => {
    rlsStorage.run({ ctx: { kind: 'public', source: 'prospect' } }, () => {
      expect(rlsLogFields()).toEqual({ 'rls.kind': 'public', 'rls.source': 'prospect' });
    });
  });

  it('reports the reason for a system scope', () => {
    rlsStorage.run({ ctx: { kind: 'system', reason: 'sweep.data-retention' } }, () => {
      expect(rlsLogFields()).toEqual({ 'rls.kind': 'system', 'rls.reason': 'sweep.data-retention' });
    });
  });
});

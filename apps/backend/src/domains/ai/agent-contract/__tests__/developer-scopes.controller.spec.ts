import { AgentScopeSchema, NEVER_EXTERNAL_SCOPES } from '@sally/shared-types';
import { DeveloperScopesController } from '../developer-scopes.controller';

describe('DeveloperScopesController', () => {
  let controller: DeveloperScopesController;
  let scopeRegistry: { toolsForScope: jest.Mock };

  beforeEach(() => {
    scopeRegistry = { toolsForScope: jest.fn().mockReturnValue([]) };
    controller = new DeveloperScopesController(scopeRegistry as never);
  });

  it('returns an entry for every scope except NEVER_EXTERNAL_SCOPES', () => {
    const rows = controller.list();
    const expectedCount = AgentScopeSchema.options.length - NEVER_EXTERNAL_SCOPES.length;
    expect(rows).toHaveLength(expectedCount);

    const returnedScopes = rows.map((r) => r.scope);
    for (const s of NEVER_EXTERNAL_SCOPES) {
      expect(returnedScopes).not.toContain(s);
    }
  });

  it('each entry has summary, plain-English, hitlTier, and sampleTools', () => {
    const rows = controller.list();
    for (const row of rows) {
      expect(typeof row.summary).toBe('string');
      expect(row.summary.length).toBeGreaterThan(0);
      expect(typeof row.grantsPlainEnglish).toBe('string');
      expect(row.grantsPlainEnglish.length).toBeGreaterThan(0);
      expect(['none', 'standard', 'sensitive']).toContain(row.hitlTier);
      expect(Array.isArray(row.sampleTools)).toBe(true);
    }
  });

  it('prefers live registry tools over static sampleTools when both are present', () => {
    // Simulate the registry returning live tools for loads:read
    scopeRegistry.toolsForScope.mockImplementation((scope: string) =>
      scope === 'loads:read' ? ['live-tool-1', 'live-tool-2'] : [],
    );
    const rows = controller.list();
    const loadsRead = rows.find((r) => r.scope === 'loads:read');
    expect(loadsRead).toBeDefined();
    expect(loadsRead?.sampleTools).toEqual(['live-tool-1', 'live-tool-2']);
  });

  it('falls back to static sampleTools when registry returns no live tools', () => {
    // Registry returns empty everywhere — static list from SCOPE_DESCRIPTIONS
    // should be used as a fallback.
    scopeRegistry.toolsForScope.mockReturnValue([]);
    const rows = controller.list();
    const fleetRead = rows.find((r) => r.scope === 'fleet:read');
    expect(fleetRead).toBeDefined();
    // SCOPE_DESCRIPTIONS['fleet:read'].sampleTools is non-empty
    expect(fleetRead?.sampleTools.length).toBeGreaterThan(0);
  });

  it('truncates live tools at 4 entries', () => {
    scopeRegistry.toolsForScope.mockReturnValue(['t1', 't2', 't3', 't4', 't5', 't6']);
    const rows = controller.list();
    for (const row of rows) {
      expect(row.sampleTools.length).toBeLessThanOrEqual(4);
    }
  });

  it('excludes platform:admin explicitly', () => {
    const rows = controller.list();
    expect(rows.find((r) => r.scope === 'platform:admin')).toBeUndefined();
  });
});

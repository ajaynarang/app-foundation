import { PLATFORM_CREDENTIAL_TYPES, PLATFORM_ROUTES } from '../route-registry';
import { AI_NEEDS } from '../routing.types';

/**
 * Every registry entry declares what it serves, its retention and how to tell whether it is configured. Ported from
 * the reference implementation in steps: this file holds the cases true for the two platform routes registered so
 * far. Prompt-cache strategies, the workspace credential types and the zero-retention platform floor join it with the
 * pull requests that add them.
 */
describe('route registry parity', () => {
  it('every platform route declares serves, retention and a config probe', () => {
    expect(PLATFORM_ROUTES.length).toBeGreaterThan(0);
    for (const route of PLATFORM_ROUTES) {
      expect(route.serves.length).toBeGreaterThan(0);
      for (const need of route.serves) expect(AI_NEEDS).toContain(need);
      expect(['ZDR', 'STANDARD']).toContain(route.retention);
      expect(typeof route.isConfigured).toBe('function');
      expect(typeof route.buildProvider).toBe('function');
      expect(route.routeId.startsWith('platform-')).toBe(true);
    }
  });

  it('route ids and ledger credential types are unique, and every credential type is a PLATFORM_ value', () => {
    const ids = PLATFORM_ROUTES.map((r) => r.routeId);
    expect(new Set(ids).size).toBe(ids.length);
    const types = PLATFORM_ROUTES.map((r) => r.credentialType);
    expect(new Set(types).size).toBe(types.length);
    for (const type of types) {
      expect(Object.values(PLATFORM_CREDENTIAL_TYPES)).toContain(type);
      // The ledger derives "platform paid" from this prefix.
      expect(type.startsWith('PLATFORM_')).toBe(true);
    }
  });

  it('the platform default: OpenRouter serves language, Cohere serves embeddings, both standard retention', () => {
    const byId = Object.fromEntries(PLATFORM_ROUTES.map((r) => [r.routeId, r]));
    expect(byId['platform-openrouter']).toMatchObject({
      credentialType: 'PLATFORM_OPENROUTER',
      serves: ['language'],
      retention: 'STANDARD',
    });
    expect(byId['platform-cohere']).toMatchObject({
      credentialType: 'PLATFORM_COHERE',
      serves: ['embedding'],
      retention: 'STANDARD',
    });
  });

  it('every need is served by some platform route (registry order is the preference order within a need)', () => {
    for (const need of AI_NEEDS) {
      expect(PLATFORM_ROUTES.some((r) => r.serves.includes(need))).toBe(true);
    }
  });
});

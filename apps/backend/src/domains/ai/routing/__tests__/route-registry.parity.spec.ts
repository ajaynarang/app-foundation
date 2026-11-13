import { AiCredentialType } from '@appshore/db';
import { PLATFORM_CREDENTIAL_TYPES, PLATFORM_ROUTES, TENANT_CREDENTIAL_CAPABILITIES } from '../route-registry';
import { AI_NEEDS } from '../routing.types';
import { PLATFORM_CREDENTIAL_TYPE_PREFIX } from '../../infrastructure/telemetry/platform-paid';
import { PROMPT_CACHE_STRATEGIES } from '../prompt-cache';

/**
 * Every registry entry declares what it serves, its retention and how to tell whether it is configured, and the
 * prompt-cache strategy of each: the three platform routes and the four workspace credential types.
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

  it('every platform route declares a prompt-cache strategy', () => {
    for (const route of PLATFORM_ROUTES) expect(PROMPT_CACHE_STRATEGIES).toContain(route.promptCache);
  });

  it('the exact prompt-cache map of the platform routes', () => {
    expect(Object.fromEntries(PLATFORM_ROUTES.map((r) => [r.routeId, r.promptCache]))).toEqual({
      'platform-openrouter': 'openrouter',
      'platform-cohere': 'none',
      'platform-bedrock': 'bedrock',
    });
  });

  it('platform-bedrock serves both needs at zero retention, labelled PLATFORM_BEDROCK', () => {
    expect(PLATFORM_ROUTES.find((r) => r.routeId === 'platform-bedrock')).toMatchObject({
      credentialType: 'PLATFORM_BEDROCK',
      serves: ['language', 'embedding'],
      retention: 'ZDR',
    });
  });

  it('a zero-retention platform floor exists for both needs (failing closed has somewhere to open to)', () => {
    for (const need of AI_NEEDS) {
      expect(PLATFORM_ROUTES.some((r) => r.retention === 'ZDR' && r.serves.includes(need))).toBe(true);
    }
  });

  it('the zero-retention route sits last, so a standard workspace keeps the standard routes', () => {
    for (const need of AI_NEEDS) {
      const serving = PLATFORM_ROUTES.filter((r) => r.serves.includes(need));
      expect(serving[0].retention).toBe('STANDARD');
      expect(serving[serving.length - 1].routeId).toBe('platform-bedrock');
    }
  });

  it("every platform credential type starts with the ledger's platform-paid prefix", () => {
    for (const route of PLATFORM_ROUTES) {
      expect(route.credentialType.startsWith(PLATFORM_CREDENTIAL_TYPE_PREFIX)).toBe(true);
    }
  });

  it('every need is served by some platform route (registry order is the preference order within a need)', () => {
    for (const need of AI_NEEDS) {
      expect(PLATFORM_ROUTES.some((r) => r.serves.includes(need))).toBe(true);
    }
  });
});

/** Workspace credential types (bring-your-own-key). */
describe('route registry parity: workspace credential types', () => {
  it('every AiCredentialType has a registry entry, and nothing else does', () => {
    expect(Object.keys(TENANT_CREDENTIAL_CAPABILITIES).sort()).toEqual(Object.values(AiCredentialType).sort());
  });

  it('every type declares serves, a retention rule and a prompt-cache strategy', () => {
    for (const capability of Object.values(TENANT_CREDENTIAL_CAPABILITIES)) {
      for (const need of capability.serves) expect(AI_NEEDS).toContain(need);
      expect(['ZDR', 'STANDARD']).toContain(capability.retention({ zdrAttested: false }));
      expect(PROMPT_CACHE_STRATEGIES).toContain(capability.promptCache);
      expect(typeof capability.buildProvider).toBe('function');
      expect(capability.serves.length).toBeGreaterThan(0);
      expect(['ZDR', 'STANDARD']).toContain(capability.retention({ zdrAttested: true }));
    }
  });

  it('BEDROCK_ROLE serves both needs at zero retention', () => {
    expect(TENANT_CREDENTIAL_CAPABILITIES.BEDROCK_ROLE.serves).toEqual(['language', 'embedding']);
    expect(TENANT_CREDENTIAL_CAPABILITIES.BEDROCK_ROLE.retention({ zdrAttested: false })).toBe('ZDR');
  });

  it('only BEDROCK_ROLE is zero-retention without an attestation', () => {
    const zdrTypes = Object.entries(TENANT_CREDENTIAL_CAPABILITIES)
      .filter(([, capability]) => capability.retention({ zdrAttested: false }) === 'ZDR')
      .map(([type]) => type);
    expect(zdrTypes).toEqual([AiCredentialType.BEDROCK_ROLE]);
  });

  it('the paste-key types serve language at the retention the design gives them', () => {
    const { ANTHROPIC_KEY, OPENROUTER_KEY, VERCEL_GATEWAY_KEY } = TENANT_CREDENTIAL_CAPABILITIES;
    expect(ANTHROPIC_KEY.serves).toEqual(['language']);
    expect(ANTHROPIC_KEY.retention({ zdrAttested: false })).toBe('STANDARD');
    expect(ANTHROPIC_KEY.retention({ zdrAttested: true })).toBe('ZDR');
    for (const capability of [OPENROUTER_KEY, VERCEL_GATEWAY_KEY]) {
      expect(capability.serves).toEqual(['language']);
      // No attestation makes these zero-retention: the flag is the Anthropic key's alone.
      expect(capability.retention({ zdrAttested: true })).toBe('STANDARD');
    }
  });

  it('the exact prompt-cache map of the workspace credential types', () => {
    expect(
      Object.fromEntries(Object.entries(TENANT_CREDENTIAL_CAPABILITIES).map(([type, c]) => [type, c.promptCache])),
    ).toEqual({
      ANTHROPIC_KEY: 'anthropic',
      OPENROUTER_KEY: 'openrouter',
      // Until someone verifies the gateway forwards Anthropic cache control.
      VERCEL_GATEWAY_KEY: 'none',
      BEDROCK_ROLE: 'bedrock',
    });
  });
});

import { AiCredentialType } from '@appshore/db';
import { PLATFORM_CREDENTIAL_TYPES, PLATFORM_ROUTES, TENANT_CREDENTIAL_CAPABILITIES } from '../route-registry';
import { AI_NEEDS } from '../routing.types';
import { PLATFORM_CREDENTIAL_TYPE_PREFIX } from '../../infrastructure/telemetry/platform-paid';
import { PROMPT_CACHE_STRATEGIES } from '../prompt-cache';

/**
 * Every registry entry declares what it serves, its retention and how to tell whether it is configured. Ported from
 * the reference implementation in steps: this file holds the cases true for the two platform routes registered so
 * far, and the prompt-cache strategy of each. The workspace credential types and the zero-retention platform floor join
 * it with the pull requests that add them.
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

  it('the exact prompt-cache map for the routes registered so far', () => {
    expect(Object.fromEntries(PLATFORM_ROUTES.map((r) => [r.routeId, r.promptCache]))).toEqual({
      'platform-openrouter': 'openrouter',
      'platform-cohere': 'none',
    });
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

/**
 * Workspace credential types (bring-your-own-key). `BEDROCK_ROLE` is in the enum so the AWS role flow needs no
 * migration, but its route arrives with that flow: until then it serves nothing, and the one assertion that every type
 * serves a need skips it by name. The AWS role change removes the skip.
 */
describe('route registry parity: workspace credential types', () => {
  const NOT_YET_SERVING: readonly AiCredentialType[] = [AiCredentialType.BEDROCK_ROLE];

  it('every AiCredentialType has a registry entry, and nothing else does', () => {
    expect(Object.keys(TENANT_CREDENTIAL_CAPABILITIES).sort()).toEqual(Object.values(AiCredentialType).sort());
  });

  it('every type declares serves, a retention rule and a prompt-cache strategy', () => {
    for (const [type, capability] of Object.entries(TENANT_CREDENTIAL_CAPABILITIES)) {
      for (const need of capability.serves) expect(AI_NEEDS).toContain(need);
      expect(['ZDR', 'STANDARD']).toContain(capability.retention({ zdrAttested: false }));
      expect(PROMPT_CACHE_STRATEGIES).toContain(capability.promptCache);
      expect(typeof capability.buildProvider).toBe('function');
      if (!NOT_YET_SERVING.includes(type as AiCredentialType)) expect(capability.serves.length).toBeGreaterThan(0);
    }
  });

  it('BEDROCK_ROLE serves nothing yet, so no resolve can pick it', () => {
    expect(TENANT_CREDENTIAL_CAPABILITIES.BEDROCK_ROLE.serves).toEqual([]);
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

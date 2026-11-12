import { readFileSync } from 'fs';
import { join } from 'path';
import configuration, {
  DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT,
  DEV_OAUTH_ISSUER_DEFAULT,
  DEV_VOICE_AGENT_SECRET_DEFAULT,
} from '../configuration';

/**
 * The production boot guard: the backend must refuse to start in production
 * with a missing, default or placeholder signing/encryption secret, with a
 * local CORS origin, or with Inngest signature verification turned off.
 * Outside production the development defaults apply and nothing is refused.
 */
describe('configuration — production boot guard', () => {
  const ORIGINAL_ENV = process.env;

  // Generated-looking values; none is a default or a placeholder.
  const SECRET_A = 'f3a91c0e5b7d48a2c6e0913f5d7b2a4c8e1f60935a7c4b2d9e0f1a3c5b7d9e1f';
  const SECRET_B = '0b2d4f6a8c1e3a5c7e9b1d3f5a7c9e0b2d4f6a8c1e3a5c7e9b1d3f5a7c9e0b2d';
  const SECRET_C = '9e7c5a3f1d0b8e6c4a2f0d9b7e5c3a1f8d6b4e2c0a9f7d5b3e1c8a6f4d2b0e9c';
  const SECRET_D = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';
  const SECRET_E = '7d9e1ff3a91c0e5b7d48a2c6e0913f5d7b2a4c8e1f60935a7c4b2d9e0f1a3c5b';
  const CREDENTIALS_KEY = '4c8e1f60935a7c4b2d9e0f1a3c5b7d9e1ff3a91c0e5b7d48a2c6e0913f5d7b2a';

  /** Every variable this guard reads, so the developer's own shell cannot leak into a test. */
  const GUARDED_VARS = [
    'NODE_ENV',
    'ENV_TYPE',
    'CORS_ORIGINS',
    'SECRET_KEY',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'OAUTH_JWT_SECRET',
    'OAUTH_CONSENT_SECRET',
    'OAUTH_ISSUER',
    'PORT',
    'CREDENTIALS_ENCRYPTION_KEY',
    'VOICE_AGENT_SECRET',
    'LIVEKIT_URL',
    'INNGEST_DEV',
    'INNGEST_SIGNING_KEY',
    'WEBHOOK_ALLOW_PRIVATE_TARGETS',
    'THROTTLE_LIMIT',
    'THROTTLE_TTL_MS',
    'TRUST_PROXY',
    'OPENROUTER_API_KEY',
    'COHERE_API_KEY',
    'OPENAI_API_KEY',
  ];

  const validProduction = (): Record<string, string> => ({
    NODE_ENV: 'production',
    REDIS_URL: 'redis://cache.internal:6379',
    CORS_ORIGINS: 'https://app.acme.io',
    SECRET_KEY: SECRET_A,
    JWT_ACCESS_SECRET: SECRET_B,
    JWT_REFRESH_SECRET: SECRET_C,
    OAUTH_JWT_SECRET: SECRET_D,
    OAUTH_CONSENT_SECRET: SECRET_E,
    OAUTH_ISSUER: 'https://api.acme.io',
    CREDENTIALS_ENCRYPTION_KEY: CREDENTIALS_KEY,
  });

  function load(overrides: Record<string, string | undefined>) {
    const next: NodeJS.ProcessEnv = { ...ORIGINAL_ENV };
    for (const name of GUARDED_VARS) delete next[name];
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) delete next[name];
      else next[name] = value;
    }
    process.env = next;
    return configuration();
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('boots production when every secret is set and CORS names a deployed origin', () => {
    const config = load(validProduction());
    expect(config.environment).toBe('production');
    expect(config.credentialsEncryptionKey).toBe(CREDENTIALS_KEY);
  });

  describe.each([
    ['SECRET_KEY'],
    ['JWT_ACCESS_SECRET'],
    ['JWT_REFRESH_SECRET'],
    ['OAUTH_JWT_SECRET'],
    ['OAUTH_CONSENT_SECRET'],
    ['CREDENTIALS_ENCRYPTION_KEY'],
  ])('%s', (envVar) => {
    it('refuses production when unset', () => {
      expect(() => load({ ...validProduction(), [envVar]: undefined })).toThrow(new RegExp(`${envVar} must be set`));
    });

    it('refuses production when blank', () => {
      expect(() => load({ ...validProduction(), [envVar]: '   ' })).toThrow(new RegExp(`${envVar} must be set`));
    });
  });

  it.each([
    ['SECRET_KEY', 'app-development-secret-key-minimum-32-chars'],
    ['JWT_ACCESS_SECRET', 'app-jwt-access-secret-change-in-production-min-32-chars'],
    ['JWT_REFRESH_SECRET', 'app-jwt-refresh-secret-change-in-production-min-32-chars'],
    ['CREDENTIALS_ENCRYPTION_KEY', DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT],
  ])('refuses production when %s is the built-in development default', (envVar, value) => {
    expect(() => load({ ...validProduction(), [envVar]: value })).toThrow(
      new RegExp(`${envVar} must be set explicitly in production`),
    );
  });

  it.each([
    // The values .env.example shows.
    ['SECRET_KEY', 'local-dev-secret-key-minimum-32-chars-here-change-me'],
    ['JWT_ACCESS_SECRET', 'local-jwt-access-secret-change-in-dev-min-32-chars'],
    ['JWT_REFRESH_SECRET', 'local-jwt-refresh-secret-change-in-dev-min-32-chars'],
    ['OAUTH_JWT_SECRET', 'your-oauth-jwt-secret-of-at-least-32-characters'],
    ['SECRET_KEY', 'changeme-changeme-changeme-changeme'],
    ['INNGEST_SIGNING_KEY', 'signkey-prod-...'],
  ])('refuses production when %s is a placeholder (%s)', (envVar, value) => {
    expect(() => load({ ...validProduction(), [envVar]: value })).toThrow(
      new RegExp(`${envVar} is still a placeholder`),
    );
  });

  it.each([
    ['SECRET_KEY'],
    ['JWT_ACCESS_SECRET'],
    ['JWT_REFRESH_SECRET'],
    ['OAUTH_JWT_SECRET'],
    ['OAUTH_CONSENT_SECRET'],
  ])('refuses production when %s is shorter than 32 characters', (envVar) => {
    expect(() => load({ ...validProduction(), [envVar]: 'f3a91c0e5b7d48a2' })).toThrow(
      new RegExp(`${envVar} must be at least 32 characters`),
    );
  });

  it('rejects a CREDENTIALS_ENCRYPTION_KEY that is not 64 hex characters, in any environment', () => {
    expect(() => load({ ...validProduction(), CREDENTIALS_ENCRYPTION_KEY: 'your-64-char-hex-key' })).toThrow(
      /CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters/,
    );
    expect(() =>
      load({ NODE_ENV: 'development', REDIS_URL: 'redis://localhost:6399', CREDENTIALS_ENCRYPTION_KEY: 'abc123' }),
    ).toThrow(/CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters/);
  });

  it('reports every problem at once', () => {
    let message = '';
    try {
      load({ NODE_ENV: 'production', REDIS_URL: 'redis://cache.internal:6379' });
    } catch (err) {
      message = (err as Error).message;
    }
    for (const envVar of [
      'SECRET_KEY',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'OAUTH_JWT_SECRET',
      'OAUTH_CONSENT_SECRET',
      'OAUTH_ISSUER',
      'CREDENTIALS_ENCRYPTION_KEY',
      'CORS_ORIGINS',
    ]) {
      expect(message).toContain(envVar);
    }
  });

  describe('VOICE_AGENT_SECRET', () => {
    const voiceOn = { LIVEKIT_URL: 'wss://voice.acme.io' };

    it('is not required while voice is off', () => {
      expect(() => load(validProduction())).not.toThrow();
    });

    it('is required once LIVEKIT_URL turns voice on', () => {
      expect(() => load({ ...validProduction(), ...voiceOn })).toThrow(/VOICE_AGENT_SECRET must be set/);
    });

    it('may not be the development default, whether or not voice is on', () => {
      expect(() =>
        load({ ...validProduction(), ...voiceOn, VOICE_AGENT_SECRET: DEV_VOICE_AGENT_SECRET_DEFAULT }),
      ).toThrow(/VOICE_AGENT_SECRET must be set explicitly/);
      expect(() => load({ ...validProduction(), VOICE_AGENT_SECRET: DEV_VOICE_AGENT_SECRET_DEFAULT })).toThrow(
        /VOICE_AGENT_SECRET must be set explicitly/,
      );
    });

    it('accepts a real secret', () => {
      expect(() => load({ ...validProduction(), ...voiceOn, VOICE_AGENT_SECRET: SECRET_A })).not.toThrow();
    });
  });

  describe('Inngest', () => {
    it.each([['1'], ['true'], ['http://localhost:8288']])('refuses production with INNGEST_DEV=%s', (value) => {
      expect(() => load({ ...validProduction(), INNGEST_DEV: value })).toThrow(/INNGEST_DEV must not be set/);
    });

    it.each([['0'], ['false']])('allows INNGEST_DEV=%s', (value) => {
      expect(() => load({ ...validProduction(), INNGEST_DEV: value })).not.toThrow();
    });

    it('does not require a signing key', () => {
      expect(() => load(validProduction())).not.toThrow();
    });
  });

  describe('CORS_ORIGINS', () => {
    it.each([
      ['http://localhost:3000'],
      ['https://app.acme.io,http://localhost:3000'],
      ['https://app.acme.io, http://127.0.0.1:3000'],
      ['http://[::1]:3000'],
      ['http://app.localhost:3000'],
      ['localhost:3000'],
    ])('refuses production with %s', (origins) => {
      expect(() => load({ ...validProduction(), CORS_ORIGINS: origins })).toThrow(
        /CORS_ORIGINS must not include a local origin/,
      );
    });

    it('refuses production when unset, because the default is localhost', () => {
      expect(() => load({ ...validProduction(), CORS_ORIGINS: undefined })).toThrow(
        /CORS_ORIGINS must not include a local origin/,
      );
    });

    it.each([
      ['https://app.acme.io'],
      ['https://app.acme.io,https://*.acme.io'],
      ['https://localhost.acme.io'],
      ['https://notlocalhost.io'],
    ])('allows %s', (origins) => {
      expect(() => load({ ...validProduction(), CORS_ORIGINS: origins })).not.toThrow();
    });
  });

  describe('OAuth provider', () => {
    it('refuses production when the consent secret is the access-token secret', () => {
      expect(() => load({ ...validProduction(), OAUTH_CONSENT_SECRET: SECRET_D })).toThrow(
        /OAUTH_CONSENT_SECRET must differ from OAUTH_JWT_SECRET/,
      );
    });

    it.each([
      ['unset, because the default is the development URL', undefined],
      ['the development default', DEV_OAUTH_ISSUER_DEFAULT],
      ['a local URL', 'https://localhost:8443'],
      ['a loopback address', 'http://127.0.0.1:8000'],
    ])('refuses production when OAUTH_ISSUER is %s', (_label, issuer) => {
      expect(() => load({ ...validProduction(), OAUTH_ISSUER: issuer })).toThrow(
        /OAUTH_ISSUER must be set to the public URL of this API in production/,
      );
    });

    it('refuses production when OAUTH_ISSUER is not https', () => {
      expect(() => load({ ...validProduction(), OAUTH_ISSUER: 'http://api.acme.io' })).toThrow(
        /OAUTH_ISSUER must be an https URL in production/,
      );
    });

    it('rejects an OAUTH_ISSUER that is not a URL, in any environment', () => {
      expect(() =>
        load({ NODE_ENV: 'development', REDIS_URL: 'redis://localhost:6399', OAUTH_ISSUER: 'api.acme.io' }),
      ).toThrow(/OAUTH_ISSUER must be a URL/);
    });

    it('outside production an unset issuer follows PORT; production still refuses that', () => {
      const dev = load({ NODE_ENV: 'development', REDIS_URL: 'redis://localhost:6399', PORT: '8010' });
      expect(dev.oauthIssuer).toBe('http://localhost:8010');
      expect(() => load({ ...validProduction(), OAUTH_ISSUER: undefined, PORT: '8010' })).toThrow(
        /OAUTH_ISSUER must be set to the public URL of this API in production/,
      );
    });

    it('exposes the issuer and both secrets to the provider', () => {
      const config = load(validProduction());
      expect(config.oauthIssuer).toBe('https://api.acme.io');
      expect(config.oauthJwtSecret).toBe(SECRET_D);
      expect(config.oauthConsentSecret).toBe(SECRET_E);
    });
  });

  describe('edge rate limit and trust proxy', () => {
    const dev = (overrides: Record<string, string>) =>
      load({ NODE_ENV: 'development', REDIS_URL: 'redis://localhost:6399', ...overrides });

    it('defaults to 100 requests per minute and no explicit trust-proxy setting', () => {
      expect(dev({}).edge).toEqual({ throttleLimit: 100, throttleTtlMs: 60_000 });
    });

    it('takes the limit, the window and trust proxy from the environment', () => {
      const config = dev({ THROTTLE_LIMIT: '600', THROTTLE_TTL_MS: '30000', TRUST_PROXY: '2' });
      expect(config.edge).toEqual({ throttleLimit: 600, throttleTtlMs: 30_000, trustProxy: '2' });
    });

    it.each([
      ['THROTTLE_LIMIT', '0'],
      ['THROTTLE_LIMIT', 'lots'],
      ['THROTTLE_LIMIT', '10.5'],
      ['THROTTLE_TTL_MS', '-1'],
    ])('refuses to boot with %s=%s', (envVar, value) => {
      expect(() => dev({ [envVar]: value })).toThrow();
    });

    it('refuses TRUST_PROXY=true in any environment', () => {
      expect(() => dev({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY=true trusts every X-Forwarded-For hop/);
      expect(() => load({ ...validProduction(), TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY=true/);
    });
  });

  describe('WEBHOOK_ALLOW_PRIVATE_TARGETS', () => {
    it('refuses production with the private-target escape hatch on', () => {
      expect(() => load({ ...validProduction(), WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true' })).toThrow(
        /WEBHOOK_ALLOW_PRIVATE_TARGETS must not be true in production/,
      );
    });

    it('is off unless set to true, and may be on outside production', () => {
      expect(load(validProduction()).webhooks.allowPrivateTargets).toBe(false);
      expect(load({ ...validProduction(), WEBHOOK_ALLOW_PRIVATE_TARGETS: 'false' }).webhooks.allowPrivateTargets).toBe(
        false,
      );
      const dev = load({
        NODE_ENV: 'development',
        REDIS_URL: 'redis://localhost:6399',
        WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
      });
      expect(dev.webhooks.allowPrivateTargets).toBe(true);
    });
  });

  // The deployment label alone makes it production: the guard must not depend on NODE_ENV being remembered.
  describe.each([
    ['unset', undefined],
    ['development', 'development'],
    ['test', 'test'],
  ])('ENV_TYPE=production with NODE_ENV %s', (_label, nodeEnv) => {
    it('is production: refuses the development defaults', () => {
      expect(() =>
        load({ NODE_ENV: nodeEnv, ENV_TYPE: 'production', REDIS_URL: 'redis://cache.internal:6379' }),
      ).toThrow(/SECRET_KEY must be set explicitly in production[\s\S]*CORS_ORIGINS must not include a local origin/);
    });

    it('is production: boots with every secret set and reports environment "production"', () => {
      const config = load({ ...validProduction(), NODE_ENV: nodeEnv, ENV_TYPE: 'Production' });
      expect(config.environment).toBe('production');
    });
  });

  it('a non-production ENV_TYPE does not turn a NODE_ENV=production deploy into development', () => {
    expect(() =>
      load({ NODE_ENV: 'production', ENV_TYPE: 'sandbox', REDIS_URL: 'redis://cache.internal:6379' }),
    ).toThrow(/SECRET_KEY must be set explicitly in production/);
  });

  it('the backend image declares NODE_ENV=production in its final stage', () => {
    const dockerfile = readFileSync(join(__dirname, '..', '..', '..', 'Dockerfile'), 'utf8');
    const finalStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
    expect(finalStage).toMatch(/^ENV NODE_ENV=production$/m);
  });

  describe.each([['development'], ['test']])('outside production (%s)', (nodeEnv) => {
    it('boots with nothing set and uses the declared development defaults', () => {
      const config = load({ NODE_ENV: nodeEnv, REDIS_URL: 'redis://localhost:6399' });
      expect(config.corsOrigins).toBe('http://localhost:3000');
      expect(config.credentialsEncryptionKey).toBe(DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT);
      expect(config.oauthJwtSecret).toBeUndefined();
      expect(config.oauthConsentSecret).toBeUndefined();
      expect(config.oauthIssuer).toBe(DEV_OAUTH_ISSUER_DEFAULT);
    });

    it('allows a local CORS origin, placeholders and Inngest dev mode', () => {
      expect(() =>
        load({
          NODE_ENV: nodeEnv,
          REDIS_URL: 'redis://localhost:6399',
          CORS_ORIGINS: 'http://localhost:3000',
          SECRET_KEY: 'local-dev-secret-key-minimum-32-chars-here-change-me',
          INNGEST_DEV: '1',
          LIVEKIT_URL: 'ws://localhost:7880',
        }),
      ).not.toThrow();
    });
  });

  describe('platform AI route keys', () => {
    const dev = { NODE_ENV: 'development', REDIS_URL: 'redis://localhost:6399' };

    it('are optional: a keyless machine boots, in development and in production', () => {
      const config = load({ ...dev, OPENROUTER_API_KEY: undefined, COHERE_API_KEY: undefined, OPENAI_API_KEY: '' });
      expect(config.openRouterApiKey).toBeUndefined();
      expect(config.cohereApiKey).toBeUndefined();
      expect(config.openaiApiKey).toBeUndefined();
      expect(() => load(validProduction())).not.toThrow();
    });

    it('carries each key under its own name', () => {
      const config = load({
        ...dev,
        OPENROUTER_API_KEY: 'sk-or-v1-test',
        COHERE_API_KEY: 'co-test',
        OPENAI_API_KEY: 'sk-openai-test',
      });
      expect(config.openRouterApiKey).toBe('sk-or-v1-test');
      expect(config.cohereApiKey).toBe('co-test');
      expect(config.openaiApiKey).toBe('sk-openai-test');
    });
  });

  it('the development credentials key is 32 bytes of hex, the bytes the cipher used before the key moved into config', () => {
    expect(DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT, 'hex').toString('utf8')).toBe(
      'dev-key-only-do-not-use-in-produ',
    );
  });
});

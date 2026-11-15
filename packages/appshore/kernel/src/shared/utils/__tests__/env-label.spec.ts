import { isDevelopmentEnv, parseEnvType, resolveObservabilityEnv } from '../env-label';
import type { EnvType, ObservabilityEnv } from '../env-type';

describe('resolveObservabilityEnv', () => {
  it.each([
    ['production', 'production'],
    ['sandbox', 'staging'],
    ['preprod', 'staging'],
    ['development', 'development'],
  ])('maps ENV_TYPE=%s to %s', (envType, label) => {
    expect(resolveObservabilityEnv(envType)).toBe(label);
  });

  it('reads the deprecated ENV_TYPE=staging as sandbox, so it is labelled staging like getEnvType()', () => {
    expect(resolveObservabilityEnv('staging')).toBe('staging');
  });

  it('normalizes case and whitespace', () => {
    expect(resolveObservabilityEnv('  Production ')).toBe('production');
  });

  it('returns unknown for an unset or empty value instead of throwing', () => {
    expect(resolveObservabilityEnv(undefined)).toBe('unknown');
    expect(resolveObservabilityEnv('')).toBe('unknown');
  });

  it('returns unknown for an unrecognized value instead of throwing', () => {
    expect(resolveObservabilityEnv('qa')).toBe('unknown');
  });

  it('is typed with the same vocabulary env-type.ts re-exports', () => {
    const envType: EnvType = 'sandbox';
    const label: ObservabilityEnv | 'unknown' = resolveObservabilityEnv(envType);
    expect(label).toBe('staging');
  });
});

describe('parseEnvType', () => {
  it('returns undefined for an unset or unknown value', () => {
    expect(parseEnvType(undefined)).toBeUndefined();
    expect(parseEnvType('qa')).toBeUndefined();
  });

  it('reads staging as sandbox', () => {
    expect(parseEnvType('STAGING')).toBe('sandbox');
  });
});

describe('isDevelopmentEnv', () => {
  const original = process.env.ENV_TYPE;
  afterEach(() => {
    if (original === undefined) delete process.env.ENV_TYPE;
    else process.env.ENV_TYPE = original;
  });

  it('is true only for ENV_TYPE=development', () => {
    expect(isDevelopmentEnv('development')).toBe(true);
    expect(isDevelopmentEnv(' Development ')).toBe(true);
    for (const other of ['production', 'sandbox', 'preprod', 'staging', 'qa', '', undefined]) {
      expect(isDevelopmentEnv(other)).toBe(false);
    }
  });

  it('reads process.env.ENV_TYPE on every call, not a cached value', () => {
    process.env.ENV_TYPE = 'development';
    expect(isDevelopmentEnv()).toBe(true);
    process.env.ENV_TYPE = 'sandbox';
    expect(isDevelopmentEnv()).toBe(false);
    delete process.env.ENV_TYPE;
    expect(isDevelopmentEnv()).toBe(false);
  });
});

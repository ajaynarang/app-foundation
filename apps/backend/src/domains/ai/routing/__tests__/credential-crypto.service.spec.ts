import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialCryptoService } from '../credential-crypto.service';

const TEST_KEY = 'a'.repeat(64); // 32 bytes of hex

function service(aiCredentialsKey: string | null = TEST_KEY): CredentialCryptoService {
  return new CredentialCryptoService(new ConfigService(aiCredentialsKey === null ? {} : { aiCredentialsKey }));
}

describe('CredentialCryptoService', () => {
  const binding = { tenantId: 7, credentialPublicId: 'aicred_abc123def4' };

  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('roundtrips a secret under the same binding', () => {
    const crypto = service();
    const { ciphertext, keyVersion } = crypto.encrypt('sk-ant-secret', binding);
    expect(keyVersion).toBe(1);
    expect(ciphertext).not.toContain('sk-ant-secret');
    expect(ciphertext.split(':')).toHaveLength(3);
    expect(crypto.decrypt(ciphertext, keyVersion, binding)).toBe('sk-ant-secret');
  });

  it('produces a fresh IV per call (no ciphertext reuse)', () => {
    const crypto = service();
    expect(crypto.encrypt('same-secret', binding).ciphertext).not.toBe(
      crypto.encrypt('same-secret', binding).ciphertext,
    );
  });

  it('fails decrypt when the ciphertext is moved to another tenant (the binding is authenticated data)', () => {
    const crypto = service();
    const { ciphertext, keyVersion } = crypto.encrypt('sk-ant-secret', binding);
    expect(() => crypto.decrypt(ciphertext, keyVersion, { ...binding, tenantId: 8 })).toThrow(/decrypt/i);
  });

  it('fails decrypt when the ciphertext is moved to another credential', () => {
    const crypto = service();
    const { ciphertext, keyVersion } = crypto.encrypt('sk-ant-secret', binding);
    expect(() =>
      crypto.decrypt(ciphertext, keyVersion, { ...binding, credentialPublicId: 'aicred_other00000' }),
    ).toThrow(/decrypt/i);
  });

  it('detects ciphertext tampering (GCM auth tag)', () => {
    const crypto = service();
    const { ciphertext, keyVersion } = crypto.encrypt('sk-ant-secret', binding);
    const [iv, tag, body] = ciphertext.split(':');
    const flipped = (parseInt(body[0], 16) ^ 0x1).toString(16) + body.slice(1);
    expect(() => crypto.decrypt([iv, tag, flipped].join(':'), keyVersion, binding)).toThrow(/decrypt/i);
  });

  it('fails decrypt under a different key: removing or replacing the key never yields a secret', () => {
    const { ciphertext, keyVersion } = service().encrypt('sk-ant-secret', binding);
    expect(() => service('b'.repeat(64)).decrypt(ciphertext, keyVersion, binding)).toThrow(/decrypt/i);
  });

  it('without a key: construction does not throw (a keyless machine boots), every use throws a generic error', () => {
    const keyless = service(null);
    expect(keyless.isConfigured()).toBe(false);
    expect(() => keyless.encrypt('x', binding)).toThrow(/credentials are unavailable/i);
    expect(() => keyless.decrypt('00:00:00', 1, binding)).toThrow(/credentials are unavailable/i);
  });

  it('has no fallback key: a blank key is no key', () => {
    expect(service('').isConfigured()).toBe(false);
    expect(() => service('').encrypt('x', binding)).toThrow(/credentials are unavailable/i);
  });

  it('refuses a 64-character key that is not all hex (Buffer.from would silently truncate it)', () => {
    const crypto = service('g'.repeat(64));
    expect(crypto.isConfigured()).toBe(false);
    expect(() => crypto.encrypt('x', binding)).toThrow(/credentials are unavailable/i);
  });

  it('rejects an unknown key version', () => {
    const crypto = service();
    const { ciphertext } = crypto.encrypt('sk-ant-secret', binding);
    expect(() => crypto.decrypt(ciphertext, 99, binding)).toThrow(/credentials are unavailable/i);
  });

  it('rejects malformed ciphertext', () => {
    expect(() => service().decrypt('not-an-envelope', 1, binding)).toThrow(/malformed/i);
  });

  it('never puts the secret or the key in an error message', () => {
    const crypto = service();
    const { ciphertext } = crypto.encrypt('sk-ant-secret', binding);
    for (const attempt of [
      () => crypto.decrypt(ciphertext, 1, { ...binding, tenantId: 9 }),
      () => service('g'.repeat(64)).encrypt('sk-ant-secret', binding),
    ]) {
      try {
        attempt();
      } catch (err) {
        expect((err as Error).message).not.toMatch(/sk-ant-secret|aaaa|gggg/);
      }
    }
  });
});

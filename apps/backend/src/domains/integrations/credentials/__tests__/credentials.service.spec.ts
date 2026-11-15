import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { CredentialsService } from '../credentials.service';
import { DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT } from '../../../../config/configuration';

const KEY = '4c8e1f60935a7c4b2d9e0f1a3c5b7d9e1ff3a91c0e5b7d48a2c6e0913f5d7b2a';
const OTHER_KEY = 'f3a91c0e5b7d48a2c6e0913f5d7b2a4c8e1f60935a7c4b2d9e0f1a3c5b7d9e1f';
const DECRYPT_FAILED = 'Failed to decrypt credentials — data may be corrupted';

function serviceWith(config: Record<string, string | undefined>): CredentialsService {
  return new CredentialsService({ get: (name: string) => config[name] } as unknown as ConfigService);
}

/** What the service wrote before the move to GCM: AES-256-CBC as `iv:data`, hex. */
function legacyCbcEncrypt(plaintext: string, hexKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(hexKey, 'hex'), iv);
  return iv.toString('hex') + ':' + cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
}

/** Flip one hex digit of one `:`-separated part. */
function tamper(ciphertext: string, partIndex: number): string {
  const parts = ciphertext.split(':');
  const part = parts[partIndex];
  parts[partIndex] = (part[0] === '0' ? '1' : '0') + part.slice(1);
  return parts.join(':');
}

describe('CredentialsService', () => {
  let service: CredentialsService;

  beforeEach(() => {
    service = serviceWith({ environment: 'production', credentialsEncryptionKey: KEY });
  });

  describe('key', () => {
    it('has no key of its own: construction fails when config supplies none', () => {
      expect(() => serviceWith({ environment: 'development' })).toThrow(/credentialsEncryptionKey is missing/);
      expect(() => serviceWith({ environment: 'production' })).toThrow(/credentialsEncryptionKey is missing/);
    });

    it('refuses the public development key in production', () => {
      expect(() =>
        serviceWith({ environment: 'production', credentialsEncryptionKey: DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT }),
      ).toThrow(/CREDENTIALS_ENCRYPTION_KEY must be set in production/);
    });

    it.each([['development'], ['test']])('accepts the declared development key in %s', (environment) => {
      const dev = serviceWith({ environment, credentialsEncryptionKey: DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT });
      expect(dev.decrypt(dev.encrypt('local'))).toBe('local');
    });

    it.each([['abc123'], ['z'.repeat(64)], [KEY + 'ab'], [KEY.slice(2)]])(
      'rejects a key that is not 32 bytes of hex (%s)',
      (bad) => {
        expect(() => serviceWith({ environment: 'development', credentialsEncryptionKey: bad })).toThrow(
          /must be 64 hex characters/,
        );
      },
    );
  });

  describe('encrypt', () => {
    it('writes the versioned AES-256-GCM format: v1:<12-byte nonce>:<16-byte tag>:<data>', () => {
      const parts = service.encrypt('my-secret').split(':');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('v1');
      expect(parts[1]).toMatch(/^[0-9a-f]{24}$/);
      expect(parts[2]).toMatch(/^[0-9a-f]{32}$/);
      expect(parts[3]).toMatch(/^[0-9a-f]{18}$/); // GCM adds no padding: 9 bytes in, 9 bytes out
    });

    it('is genuinely AES-256-GCM under the configured key', () => {
      const [, nonce, tag, data] = service.encrypt('independent check').split(':');
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), Buffer.from(nonce, 'hex'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      const plain = Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
      expect(plain).toBe('independent check');
    });

    it('uses a fresh nonce per call', () => {
      expect(service.encrypt('same-value')).not.toBe(service.encrypt('same-value'));
    });
  });

  describe('decrypt', () => {
    it.each([
      ['plain text', 'hello-world'],
      ['special characters', 'p@$$w0rd!#%^&*()_+-={}[]|\\:";\'<>?,./~`'],
      ['unicode', 'こんにちは世界 ✓'],
      ['an empty string', ''],
      ['a long string', 'a'.repeat(10000)],
      ['JSON', JSON.stringify({ accessToken: 'a:b:c', refreshToken: 'd' })],
    ])('round-trips %s', (_label, plaintext) => {
      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });

    it.each([
      ['nonce', 1],
      ['tag', 2],
      ['data', 3],
    ])('rejects a value whose %s was changed (authenticated encryption)', (_label, partIndex) => {
      const tampered = tamper(service.encrypt('transfer 10 to account 1'), partIndex);
      expect(() => service.decrypt(tampered)).toThrow(DECRYPT_FAILED);
    });

    it('rejects a truncated auth tag', () => {
      const [version, nonce, tag, data] = service.encrypt('x').split(':');
      expect(() => service.decrypt([version, nonce, tag.slice(0, 8), data].join(':'))).toThrow(DECRYPT_FAILED);
    });

    it('rejects a value encrypted under another key', () => {
      const other = serviceWith({ environment: 'production', credentialsEncryptionKey: OTHER_KEY });
      expect(() => service.decrypt(other.encrypt('secret'))).toThrow(DECRYPT_FAILED);
    });

    it.each([
      ['no separator', 'invalidformat'],
      ['empty', ''],
      ['empty iv', ':abcdef'],
      ['empty data', 'abcdef:'],
      ['non-hex legacy', 'iv:encrypted'],
      ['v1 with a part missing', 'v1:aabb:ccdd'],
      ['v1 with an extra part', 'v1:aa:bb:cc:dd'],
      ['an unknown version', 'v9:aa:bb:cc'],
      ['a plain URL', 'https://api.acme.io'],
    ])('throws one generic error for a malformed value (%s)', (_label, value) => {
      expect(() => service.decrypt(value)).toThrow(DECRYPT_FAILED);
    });
  });

  describe('legacy AES-256-CBC values', () => {
    it('still decrypt', () => {
      const legacy = legacyCbcEncrypt('stored-before-the-change', KEY);
      expect(legacy.split(':')).toHaveLength(2);
      expect(service.decrypt(legacy)).toBe('stored-before-the-change');
    });

    it('written under the old built-in development key decrypt with the declared development default', () => {
      // Before the key moved into config the service used the first 32 characters of this constant.
      const oldDevKey = Buffer.from(
        'dev-key-only-do-not-use-in-production-12345678901234567890123456789012'.slice(0, 32),
      );
      const legacy = legacyCbcEncrypt('local-token', oldDevKey.toString('hex'));
      const dev = serviceWith({
        environment: 'development',
        credentialsEncryptionKey: DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT,
      });
      expect(dev.decrypt(legacy)).toBe('local-token');
    });

    it('move to v1 when re-encrypted, and are never written again', () => {
      const legacy = legacyCbcEncrypt('rotate-me', KEY);
      expect(service.isLegacyFormat(legacy)).toBe(true);
      const rewritten = service.encrypt(service.decrypt(legacy));
      expect(service.isLegacyFormat(rewritten)).toBe(false);
      expect(rewritten.startsWith('v1:')).toBe(true);
      expect(service.decrypt(rewritten)).toBe('rotate-me');
    });
  });
});

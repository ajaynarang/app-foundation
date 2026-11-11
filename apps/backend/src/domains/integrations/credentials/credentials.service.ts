import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT } from '../../../config/configuration';

/** Current format: AES-256-GCM, 96-bit nonce, 128-bit tag. */
const FORMAT_V1 = 'v1';
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const CBC_IV_BYTES = 16;
const KEY_BYTES = 32;
const HEX = /^[0-9a-f]*$/i;

const DECRYPT_FAILED = 'Failed to decrypt credentials — data may be corrupted';

/**
 * Encrypts integration credentials at rest.
 *
 * Ciphertext is a versioned string, so the cipher can change again without
 * guessing what a stored value is:
 *
 *   v1:<nonce>:<tag>:<data>   AES-256-GCM (authenticated), all parts hex.
 *   <iv>:<data>               Legacy AES-256-CBC, hex. Read only.
 *
 * `encrypt` always writes v1. `decrypt` reads both, so values stored before
 * the change keep working and move to v1 the next time they are saved.
 *
 * The key comes from config (`credentialsEncryptionKey`, env
 * CREDENTIALS_ENCRYPTION_KEY). This service has no key of its own: the
 * development default is declared in the config schema, and production
 * refuses to boot with it.
 */
@Injectable()
export class CredentialsService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hexKey = config.get<string>('credentialsEncryptionKey');
    if (!hexKey) {
      throw new Error('credentialsEncryptionKey is missing from config (env CREDENTIALS_ENCRYPTION_KEY)');
    }
    // The config schema already refuses this at boot; checked again here so the
    // public development key cannot encrypt production data by any other route.
    if (config.get<string>('environment') === 'production' && hexKey === DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY must be set in production: the development default is public');
    }
    const key = HEX.test(hexKey) ? Buffer.from(hexKey, 'hex') : Buffer.alloc(0);
    if (key.length !== KEY_BYTES) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    this.key = key;
  }

  /** Returns `v1:<nonce>:<tag>:<data>`; a fresh nonce per call. */
  encrypt(plaintext: string): string {
    const nonce = crypto.randomBytes(GCM_NONCE_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: GCM_TAG_BYTES });
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [FORMAT_V1, nonce.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
  }

  /** Reads v1 and legacy values. Throws on anything malformed, tampered with or encrypted under another key. */
  decrypt(ciphertext: string): string {
    try {
      const parts = ciphertext.split(':');
      return parts[0] === FORMAT_V1 ? this.decryptV1(parts) : this.decryptLegacyCbc(parts);
    } catch {
      // One message for every failure: the cause must not reach the caller.
      throw new InternalServerErrorException(DECRYPT_FAILED);
    }
  }

  /** True for a value `encrypt` no longer produces; callers can use it to find rows worth re-saving. */
  isLegacyFormat(ciphertext: string): boolean {
    return !ciphertext.startsWith(`${FORMAT_V1}:`);
  }

  private decryptV1(parts: string[]): string {
    if (parts.length !== 4) throw new Error('malformed');
    const [nonce, tag, data] = parts.slice(1).map((part) => fromHex(part));
    if (nonce.length !== GCM_NONCE_BYTES || tag.length !== GCM_TAG_BYTES) throw new Error('malformed');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, nonce, { authTagLength: GCM_TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  private decryptLegacyCbc(parts: string[]): string {
    if (parts.length !== 2) throw new Error('malformed');
    const [iv, data] = parts.map((part) => fromHex(part));
    if (iv.length !== CBC_IV_BYTES || data.length === 0) throw new Error('malformed');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}

function fromHex(value: string): Buffer {
  if (!HEX.test(value) || value.length % 2 !== 0) throw new Error('malformed');
  return Buffer.from(value, 'hex');
}
